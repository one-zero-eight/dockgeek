import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import https from "node:https";
import { TextDecoder } from "node:util";
import { DockgeekServer } from "./dockge-server";
import { Settings } from "./settings";
import { Project } from "./project";
import { matchesFilePatterns } from "../common/util-common";

const LIMIT = 1024 * 1024;
const DEFAULT_EDITOR_SCHEMA_ALLOWED_PREFIXES = [ "https://raw.githubusercontent.com/" ];
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Pin HTTPS to an address already checked by publicAddress, including all-address lookups. */
export function pinnedSchemaLookup(address: LookupAddress): NonNullable<Parameters<typeof https.get>[1]>["lookup"] {
    return (_hostname, options, callback) => callback(null, options.all ? [ address ] : address.address, address.family);
}
export class EditorSchemaError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

export interface EditorSchemaRequest {
    source: "project" | "files";
    projectName?: string;
    filename?: string;
    path?: string;
    schemaUrl: string;
    baseUri?: string;
}

/** One HTTPS URL prefix per line; explicit host and path, no wildcards, credentials or ports. */
export function parseEditorSchemaAllowedPrefixes(input: unknown): string[] {
    if (typeof input !== "string" || input.length > 8192) {
        throw new EditorSchemaError("VALIDATION", "Schema allowed prefixes must be newline-separated HTTPS URL prefixes (up to 8192 characters).");
    }
    const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length > 64) {
        throw new EditorSchemaError("VALIDATION", "Too many schema URL prefixes.");
    }
    return lines.map(line => {
        let url: URL;
        try {
            url = new URL(line);
        } catch {
            throw new EditorSchemaError("VALIDATION", "Invalid schema URL prefix.");
        }
        if (url.protocol !== "https:" || !url.hostname || isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
            url.username || url.password || url.port || url.search || url.hash ||
            !/^https:\/\/[a-z0-9.-]+\/[a-zA-Z0-9/_~.-]*$/.test(line) ||
            !url.pathname.endsWith("/") || url.pathname.includes("..") || url.pathname.includes("%") ||
            url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
            throw new EditorSchemaError("VALIDATION", "Schema prefixes must be HTTPS domain URLs ending in / without ports, wildcards, credentials, queries or escapes.");
        }
        return url.href;
    });
}

function allowedRemote(url: URL, prefixes: string[]): boolean {
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname === "localhost" ||
        url.hostname.endsWith(".localhost") || isIP(url.hostname.replace(/^\[|\]$/g, ""))) {
        return false;
    }
    return [ ...DEFAULT_EDITOR_SCHEMA_ALLOWED_PREFIXES, ...prefixes ].some(prefix => url.href.startsWith(prefix));
}

function inside(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function readLocal(target: string, root: string): Promise<string> {
    const canonicalRoot = await fs.realpath(root);
    const absolute = path.resolve(target);
    if (!inside(canonicalRoot, absolute)) {
        throw new EditorSchemaError("SCHEMA_PATH_DENIED", "Schema is outside the projects directory.");
    }
    let current = canonicalRoot;
    for (const segment of path.relative(canonicalRoot, absolute).split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) {
            throw new EditorSchemaError("SCHEMA_PATH_DENIED", "Schema symlinks are not allowed.");
        }
    }
    const handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        // Verify the opened inode, not just the path checked before open (parent swaps can race).
        if (process.platform === "linux" && !inside(canonicalRoot, await fs.realpath(`/proc/self/fd/${handle.fd}`))) {
            throw new EditorSchemaError("SCHEMA_PATH_DENIED", "Schema is outside the projects directory.");
        }
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > LIMIT) {
            throw new EditorSchemaError("SCHEMA_SIZE", "Schema must be a regular file no larger than 1 MiB.");
        }
        const buffer = await handle.readFile();
        if (buffer.length > LIMIT) {
            throw new EditorSchemaError("SCHEMA_SIZE", "Schema exceeds 1 MiB.");
        }
        return decode(buffer);
    } finally {
        await handle.close();
    }
}

function decode(buffer: Buffer): string {
    try {
        return decoder.decode(buffer);
    } catch {
        throw new EditorSchemaError("SCHEMA_ENCODING", "Schema must be UTF-8.");
    }
}

export function publicAddress(address: string): boolean {
    if (!isIP(address)) {
        return false;
    }
    const parsed = ipaddr.parse(address);
    // ipaddr.js classifies reserved, private, mapped and transition networks.
    // For IPv6, also require global unicast: the range classifier leaves
    // otherwise unassigned non-global space as "unicast".
    return parsed.range() === "unicast" && (parsed.kind() === "ipv4" || parsed.match(ipaddr.parseCIDR("2000::/3")));
}

async function fetchRemote(initial: URL, prefixes: string[]): Promise<{ content: string; uri: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        let url = initial;
        for (let redirects = 0; redirects <= 4; redirects++) {
            if (!allowedRemote(url, prefixes)) {
                throw new EditorSchemaError("SCHEMA_URL_DENIED", "Schema URL is not allowed.");
            }
            const addresses = await Promise.race([
                lookup(url.hostname, { all: true, verbatim: true }),
                new Promise<never>((_resolve, reject) => {
                    if (controller.signal.aborted) {
                        reject(new EditorSchemaError("SCHEMA_FETCH_FAILED", "Schema fetch timed out."));
                    } else {
                        controller.signal.addEventListener("abort", () => reject(new EditorSchemaError("SCHEMA_FETCH_FAILED", "Schema fetch timed out.")), { once: true });
                    }
                }),
            ]);
            if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) {
                throw new EditorSchemaError("SCHEMA_URL_DENIED", "Schema host does not resolve exclusively to public addresses.");
            }
            const result = await new Promise<{ content?: string; redirect?: string }>((resolve, reject) => {
                const request = https.get(url, {
                    signal: controller.signal,
                    timeout: 5000,
                    lookup: pinnedSchemaLookup(addresses[0]),
                    headers: { accept: "application/json, application/yaml, text/yaml, text/plain, */*" },
                }, response => {
                    const status = response.statusCode || 0;
                    if (status >= 300 && status < 400 && response.headers.location) {
                        response.resume();
                        resolve({ redirect: response.headers.location });
                        return;
                    }
                    if (status !== 200) {
                        response.resume();
                        reject(new EditorSchemaError("SCHEMA_FETCH_FAILED", `Schema server returned HTTP ${status}.`));
                        return;
                    }
                    if (Number(response.headers["content-length"]) > LIMIT) {
                        response.destroy();
                        reject(new EditorSchemaError("SCHEMA_SIZE", "Schema exceeds 1 MiB."));
                        return;
                    }
                    const chunks: Buffer[] = [];
                    let size = 0;
                    response.on("data", (chunk: Buffer) => {
                        size += chunk.length;
                        if (size > LIMIT) {
                            response.destroy(new EditorSchemaError("SCHEMA_SIZE", "Schema exceeds 1 MiB."));
                        } else {
                            chunks.push(chunk);
                        }
                    });
                    response.on("error", reject);
                    response.on("end", () => {
                        try {
                            resolve({ content: decode(Buffer.concat(chunks)) });
                        } catch (error) {
                            reject(error);
                        }
                    });
                });
                request.on("timeout", () => request.destroy(new EditorSchemaError("SCHEMA_FETCH_FAILED", "Schema fetch timed out.")));
                request.on("error", reject);
            });
            if (result.redirect) {
                url = new URL(result.redirect, url);
            } else {
                return { content: result.content!, uri: url.href };
            }
        }
        throw new EditorSchemaError("SCHEMA_FETCH_FAILED", "Too many schema redirects.");
    } finally {
        clearTimeout(timer);
    }
}

export async function readEditorSchema(server: DockgeekServer, request: EditorSchemaRequest): Promise<{ content: string; uri: string }> {
    if (!request || (request.source !== "project" && request.source !== "files") ||
        typeof request.schemaUrl !== "string" || !request.schemaUrl || request.schemaUrl.length > 4096 ||
        (request.baseUri !== undefined && (typeof request.baseUri !== "string" || request.baseUri.length > 4096))) {
        throw new EditorSchemaError("VALIDATION", "Invalid schema request.");
    }
    let document: string;
    if (request.source === "project") {
        const project = await Project.getProject(server, request.projectName as string);
        const filename = request.filename;
        if (!project.isManagedByDockgeek || typeof filename !== "string" || filename !== path.basename(filename) ||
            !matchesFilePatterns(filename, filename === path.basename(project.composeFilePath) ? server.composeFilePatterns : server.editableFilePatterns)) {
            throw new EditorSchemaError("SCHEMA_PATH_DENIED", "Invalid managed project document.");
        }
        const projectRoot = await fs.realpath(server.projectsDir);
        const projectPath = await fs.realpath(project.fullPath);
        if (!inside(projectRoot, projectPath)) {
            throw new EditorSchemaError("SCHEMA_PATH_DENIED", "Project is outside the projects directory.");
        }
        const documentPath = path.join(projectPath, filename);
        try {
            document = await fs.realpath(documentPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error;
            }
            // New editor tabs do not exist on disk yet; the project directory is
            // canonical and the filename was already restricted to a basename.
            document = documentPath;
        }
        if (!inside(projectPath, document)) {
            throw new EditorSchemaError("SCHEMA_PATH_DENIED", "Document is outside its project.");
        }
    } else {
        if (!server.fileManager) {
            throw new EditorSchemaError("SCHEMA_PATH_DENIED", "File manager is disabled.");
        }
        const source = await server.fileManager.resolveExisting(request.path, false);
        if (!source.stat.isFile()) {
            throw new EditorSchemaError("SCHEMA_PATH_DENIED", "Document must be a regular file.");
        }
        document = source.absolute;
    }

    let base = pathToFileURL(document);
    if (request.baseUri !== undefined) {
        try {
            base = new URL(request.baseUri);
        } catch {
            throw new EditorSchemaError("VALIDATION", "Invalid schema base URI.");
        }
        if (base.protocol !== "file:" && base.protocol !== "https:") {
            throw new EditorSchemaError("SCHEMA_URL_DENIED", "Unsupported schema base URI.");
        }
    }
    let target: URL;
    try {
        target = base.protocol === "file:" && path.isAbsolute(request.schemaUrl)
            ? pathToFileURL(request.schemaUrl) : new URL(request.schemaUrl, base);
    } catch {
        throw new EditorSchemaError("VALIDATION", "Invalid schema URL.");
    }
    target.hash = "";
    if (target.protocol === "file:") {
        if (target.host || target.search) {
            throw new EditorSchemaError("SCHEMA_URL_DENIED", "Invalid local schema URL.");
        }
        const filename = fileURLToPath(target);
        return { content: await readLocal(filename, server.projectsDir), uri: pathToFileURL(filename).href };
    }
    if (target.protocol !== "https:") {
        throw new EditorSchemaError("SCHEMA_URL_DENIED", "Only local files and HTTPS schemas are supported.");
    }
    const prefixes = parseEditorSchemaAllowedPrefixes((await Settings.get("editorSchemaAllowedPrefixes")) || "");
    return fetchRemote(target, prefixes);
}
