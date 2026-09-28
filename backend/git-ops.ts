import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { DockgeekServer } from "./dockge-server";
import { Project } from "./project";
import { ValidationError } from "./util-server";
import { matchesFilePatterns, toComposeProjectName, validateProjectFolderName } from "../common/util-common";

export interface GitProjectPayload {
    name: string;
    isAdd: boolean;
    composeYAML: string;
    composeENV: string;
    filename: string;
    draftFiles: Record<string, string>;
    modifiedFiles?: Record<string, string>;
    deletedFiles?: string[];
    renames?: { from: string; to: string }[];
    deploy?: boolean;
    previewId?: string;
}

type Credential = { type: "https"; username: string; token: string } | { type: "ssh"; privateKey: string };
type Preview = { payload: GitProjectPayload; root: string; dir: string; files: string[]; fingerprint: string; expires: number; branch: string; head: string; remote: string; remoteRef: string; tree: string };
const previews = new Map<string, Preview>();
const active = new Set<string>();
const safeEnv = () => Object.fromEntries(Object.entries(process.env).filter(([ k ]) => !k.startsWith("GIT_") && !k.startsWith("DOCKGEEK_GIT_") && k !== "SSH_ASKPASS" && k !== "GIT_SSH_COMMAND")) as NodeJS.ProcessEnv;

async function run(cwd: string, args: string[], options: { env?: NodeJS.ProcessEnv; index?: string; input?: string } = {}): Promise<string> {
    const env: NodeJS.ProcessEnv = { ...safeEnv(), GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes", ...options.env };
    if (options.env?.GIT_SSH) {
        delete env.GIT_SSH_COMMAND;
    }
    if (options.index) {
        env.GIT_INDEX_FILE = options.index;
    }
    const command = [ "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "protocol.ext.allow=never", "-c", "credential.helper=", "-c", "user.name=Dockgeek", "-c", "user.email=dockgeek@localhost", ...args ];
    return new Promise((resolve, reject) => {
        const child = spawn("git", command, { cwd, env, stdio: [ "pipe", "pipe", "pipe" ] });
        let stdout = "";
        child.stdout.setEncoding("utf8").on("data", chunk => {
            stdout += chunk;
        });
        child.stderr.resume();
        child.on("error", () => reject(new Error("Git executable unavailable")));
        child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`Git operation failed (${args[0]})${[ "ls-remote", "push" ].includes(args[0]) ? "; check upstream, credentials and remote access" : ""}`)));
        child.stdin.end(options.input);
    });
}

function assertFile(file: unknown, patterns: string): asserts file is string {
    if (typeof file !== "string" || !file || file === "." || file === ".." || file.includes("/") || file.includes("\\") || file.includes("\0") || !matchesFilePatterns(file, patterns)) {
        throw new ValidationError("File is not allowed");
    }
}

function validate(payload: GitProjectPayload, server: DockgeekServer) {
    if (!payload || typeof payload !== "object" || typeof payload.name !== "string" || typeof payload.isAdd !== "boolean" || typeof payload.composeYAML !== "string" || typeof payload.composeENV !== "string" || typeof payload.filename !== "string" || (payload.deploy !== undefined && typeof payload.deploy !== "boolean")) {
        throw new ValidationError("Invalid Git project payload");
    }
    assertFile(payload.filename, server.composeFilePatterns);
    if (Buffer.byteLength(payload.composeYAML) > 1024 * 1024 || Buffer.byteLength(payload.composeENV) > 1024 * 1024) {
        throw new ValidationError("Project file too large");
    }
    const draft = payload.draftFiles ?? {};
    const modified = payload.modifiedFiles ?? {};
    const deleted = payload.deletedFiles ?? [];
    const renames = payload.renames ?? [];
    if (!draft || Array.isArray(draft) || typeof draft !== "object" || !modified || Array.isArray(modified) || typeof modified !== "object" || !Array.isArray(deleted) || !Array.isArray(renames)) {
        throw new ValidationError("Invalid project file changes");
    }
    if (payload.isAdd && (Object.keys(modified).length || deleted.length || renames.length) || !payload.isAdd && Object.keys(draft).length) {
        throw new ValidationError("Invalid project file changes");
    }
    const files = new Set([ payload.filename, ".env" ]);
    for (const [ file, content ] of Object.entries({ ...draft, ...modified })) {
        assertFile(file, server.editableFilePatterns);
        if (file === payload.filename || typeof content !== "string" || Buffer.byteLength(content) > 1024 * 1024) {
            throw new ValidationError("Invalid project file content");
        }
        files.add(file);
    }
    for (const file of deleted) {
        assertFile(file, server.editableFilePatterns);
        files.add(file);
    }
    for (const rename of renames) {
        if (!rename || typeof rename !== "object") {
            throw new ValidationError("Invalid rename");
        }
        assertFile(rename.from, server.editableFilePatterns);
        assertFile(rename.to, server.editableFilePatterns);
        files.add(rename.from);
        files.add(rename.to);
    }
    if (renames.some(rename => rename.from === rename.to || rename.from === payload.filename || rename.to === payload.filename || rename.from === ".env" || rename.to === ".env") || deleted.includes(payload.filename) || Object.keys(modified).includes(payload.filename) || new Set([ ...deleted, ...renames.map(r => r.from), ...renames.map(r => r.to) ]).size !== deleted.length + renames.length * 2 || Object.keys(modified).some(file => deleted.includes(file) || renames.some(rename => rename.from === file)) || Object.keys(draft).includes(".env") || Object.keys(modified).includes(".env")) {
        throw new ValidationError("Conflicting file changes");
    }
    return [ ...files ];
}

async function regularOrMissing(dir: string, file: string) {
    try {
        if (!(await fs.lstat(path.join(dir, file))).isFile()) {
            throw new ValidationError("Project file must be regular");
        }
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
            throw e;
        }
    }
}

async function fingerprint(root: string, dir: string, files: string[], head: string): Promise<string> {
    const hash = createHash("sha256").update(head);
    for (const file of files.sort()) {
        await regularOrMissing(dir, file);
        hash.update(file);
        try {
            hash.update(await fs.readFile(path.join(dir, file)));
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                throw e;
            }
            hash.update("<missing>");
        }
    }
    hash.update(await run(root, [ "status", "--porcelain=v1", "--untracked-files=all", "--", ...files.map(f => path.relative(root, path.join(dir, f))) ]));
    return hash.digest("hex");
}

async function repositoryRoot(base: string, dir: string, isAdd: boolean): Promise<string | undefined> {
    const candidates = isAdd ? [ base ] : [ dir, base ];
    for (const candidate of candidates) {
        const dotGit = await fs.lstat(path.join(candidate, ".git")).then(stat => stat.isFile() || stat.isDirectory(), () => false);
        if (dotGit && await run(candidate, [ "rev-parse", "--show-toplevel" ]).then(root => root === candidate, () => false)) {
            return candidate;
        }
    }
    return undefined;
}

async function context(server: DockgeekServer, payload: GitProjectPayload) {
    const files = validate(payload, server);
    const base = await fs.realpath(server.projectsDir);
    let dir: string;
    if (payload.isAdd) {
        validateProjectFolderName(payload.name);
        if (payload.name.trim() !== payload.name) {
            throw new ValidationError("Invalid folder name");
        }
        dir = path.join(base, payload.name);
        try {
            await fs.lstat(dir);
            throw new ValidationError("Project already exists");
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                throw e;
            }
        }
        const name = toComposeProjectName(payload.name);
        if (!name) {
            throw new ValidationError("Invalid project name");
        }
        const declaredName = yaml.parse(payload.composeYAML)?.name;
        const composeName = typeof declaredName === "string" ? declaredName : name;
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(composeName)) {
            throw new ValidationError("Invalid Compose project name");
        }
        if ((await Project.getProjectList(server)).has(composeName)) {
            throw new ValidationError("Compose project name already exists");
        }
    } else {
        const project = await Project.getProject(server, payload.name);
        dir = await fs.realpath(project.fullPath);
        if (!project.isManagedByDockgeek || !Project.isPathInside(base, dir) || path.basename(project.composeFilePath) !== payload.filename) {
            throw new ValidationError("Project is not managed here");
        }
    }
    if (!Project.isPathInside(base, dir)) {
        throw new ValidationError("Project outside projects directory");
    }
    const root = await repositoryRoot(base, dir, payload.isAdd);
    if (!root) {
        throw new ValidationError("Not a Git repository");
    }
    const branch = await run(root, [ "symbolic-ref", "--quiet", "HEAD" ]);
    if (!/^refs\/heads\/[a-zA-Z0-9._/-]+$/.test(branch)) {
        throw new ValidationError("A Git branch is required");
    }
    const head = await run(root, [ "rev-parse", "HEAD" ]).catch(() => {
        throw new ValidationError("Git repository needs an initial commit before saving projects");
    });
    const upstream = await run(root, [ "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}" ]).catch(() => {
        throw new ValidationError("Git branch has no upstream; configure a remote tracking branch first");
    });
    const remote = upstream.split("/")[0];
    const remoteRef = `refs/heads/${upstream.slice(remote.length + 1)}`;
    if (!/^[a-zA-Z0-9._-]+$/.test(remote) || !/^refs\/heads\/[a-zA-Z0-9._/-]+$/.test(remoteRef)) {
        throw new ValidationError("Invalid Git upstream");
    }
    const url = await run(root, [ "remote", "get-url", "--push", remote ]).catch(() => {
        throw new ValidationError("Git upstream remote is unavailable; configure its push URL");
    });
    if (!/^https:\/\/[^@\s]+\//.test(url) && !/^(ssh:\/\/|git@)[^\s]+/.test(url) || /https:\/\/[^/]*@/.test(url)) {
        throw new ValidationError("Only HTTPS or SSH remotes without embedded credentials are supported");
    }
    const pushUrls = await run(root, [ "remote", "get-url", "--push", "--all", remote ]);
    if (pushUrls.split("\n").length !== 1) {
        throw new ValidationError("Git remote must have one push URL");
    }
    for (const file of files) {
        await regularOrMissing(dir, file);
    }
    return { root, dir, files, branch, head, remote, remoteRef };
}

function credentialDir(server: DockgeekServer): string {
    const location = path.resolve(process.env.DOCKGEEK_GIT_CREDENTIALS_DIR || path.join(os.homedir(), ".config", "dockgeek", "git-credentials"));
    const projects = path.resolve(server.projectsDir);
    const data = path.resolve(server.config?.dataDir || process.env.DOCKGEEK_DATA_DIR || "/app/dockgeek-data");
    if (location === projects || location.startsWith(projects + path.sep) || location === data || location.startsWith(data + path.sep)) {
        throw new ValidationError("Git credentials must be stored outside project and data directories");
    }
    return location;
}
async function credentialPath(server: DockgeekServer, root: string): Promise<string> {
    const dir = credentialDir(server);
    const projects = await fs.realpath(server.projectsDir);
    const data = await fs.realpath(server.config?.dataDir || process.env.DOCKGEEK_DATA_DIR || "/app/dockgeek-data").catch(() => path.resolve(server.config?.dataDir || process.env.DOCKGEEK_DATA_DIR || "/app/dockgeek-data"));
    if (dir === projects || Project.isPathInside(projects, dir) || dir === data || Project.isPathInside(data, dir)) {
        throw new ValidationError("Git credentials must be stored outside project and data directories");
    }
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    if (!(await fs.lstat(dir)).isDirectory() || path.resolve(await fs.realpath(dir)) !== path.resolve(dir)) {
        throw new ValidationError("Invalid credential directory");
    }
    await fs.chmod(dir, 0o700);
    return path.join(dir, createHash("sha256").update(root).digest("hex") + ".json");
}
async function loadCredential(server: DockgeekServer, root: string): Promise<Credential | undefined> {
    const file = await credentialPath(server, root);
    try {
        if (!(await fs.lstat(file)).isFile()) {
            throw new ValidationError("Invalid credential file");
        }
        const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            return JSON.parse(await handle.readFile("utf8"));
        } finally {
            await handle.close();
        }
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
            return undefined;
        }
        throw e;
    }
}
export async function listGitCredentials(server: DockgeekServer, root: string) {
    const credential = await loadCredential(server, root);
    return credential ? { configured: true, type: credential.type, ...(credential.type === "https" ? { username: credential.username } : {}) } : { configured: false };
}
export async function setGitCredential(server: DockgeekServer, root: string, value: Credential) {
    if (!value || (value.type !== "https" && value.type !== "ssh") || (value.type === "https" && (!value.username || !value.token || typeof value.username !== "string" || typeof value.token !== "string" || /[\r\n]/.test(value.username) || value.username.length > 1024 || value.token.length > 16384)) || (value.type === "ssh" && (!value.privateKey || typeof value.privateKey !== "string" || value.privateKey.length > 16384))) {
        throw new ValidationError("Invalid Git credential");
    }
    const file = await credentialPath(server, root);
    const temp = file + "." + randomUUID();
    try {
        await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
        await fs.rename(temp, file);
    } finally {
        await fs.rm(temp, { force: true });
    }
}
export async function deleteGitCredential(server: DockgeekServer, root: string) {
    await fs.rm(await credentialPath(server, root), { force: true });
}

async function push(preview: Preview, server: DockgeekServer, commit: string) {
    const credential = await loadCredential(server, preview.root);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dockgeek-git-auth-"));
    try {
        const env: NodeJS.ProcessEnv = {};
        if (credential?.type === "https") {
            const file = path.join(temp, "credential.json");
            await fs.writeFile(file, JSON.stringify(credential), { mode: 0o600 });
            const helper = path.join(temp, "askpass");
            await fs.writeFile(helper, "#!/usr/bin/env node\nconst c=JSON.parse(require('fs').readFileSync(process.env.DOCKGEEK_GIT_AUTH_FILE,'utf8'));process.stdout.write(/username/i.test(process.argv[2])?c.username:c.token);\n", { mode: 0o700 });
            env.GIT_ASKPASS = helper;
            env.DOCKGEEK_GIT_AUTH_FILE = file;
        } else if (credential?.type === "ssh") {
            const key = path.join(temp, "key");
            await fs.writeFile(key, credential.privateKey, { mode: 0o600 });
            const wrapper = path.join(temp, "ssh");
            await fs.writeFile(wrapper, "#!/bin/sh\nexec ssh -i \"$DOCKGEEK_GIT_KEY_FILE\" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \"$@\"\n", { mode: 0o700 });
            env.GIT_SSH = wrapper;
            delete env.GIT_SSH_COMMAND;
            env.DOCKGEEK_GIT_KEY_FILE = key;
        }
        const remoteHead = await run(preview.root, [ "ls-remote", preview.remote, preview.remoteRef ], { env });
        if (remoteHead.split(/\s/)[0] !== preview.head) {
            throw new ValidationError("Remote changed; pull before applying Git project");
        }
        await run(preview.root, [ "push", preview.remote, `${commit}:${preview.remoteRef}` ], { env });
    } finally {
        await fs.rm(temp, { recursive: true, force: true });
    }
}

async function alignUnstagedIndex(root: string, oldHead: string, commit: string, files: string[]) {
    for (const file of files) {
        // An entry already staged by the user belongs to them; only advance clean index entries.
        const [ indexed, oldEntry, newEntry ] = await Promise.all([
            run(root, [ "ls-files", "--stage", "--", file ]),
            run(root, [ "ls-tree", oldHead, "--", file ]),
            run(root, [ "ls-tree", commit, "--", file ]),
        ]);
        const oldObject = oldEntry.split("\t")[0].split(" ");
        const indexedObject = indexed.split("\t")[0].split(" ");
        if ((indexed || oldEntry) && (indexedObject[0] !== oldObject[0] || indexedObject[1] !== oldObject[2] || indexedObject[2] !== "0")) {
            continue;
        }
        if (newEntry) {
            const [ mode, , hash ] = newEntry.split("\t")[0].split(" ");
            await run(root, [ "update-index", "--add", "--cacheinfo", `${mode},${hash},${file}` ]);
        } else {
            await run(root, [ "update-index", "--force-remove", "--", file ]);
        }
    }
}

type GitChange = { path: string; type: "create" | "modify" | "delete"; diff: string };

async function stageChanges(ctx: Awaited<ReturnType<typeof context>>, payload: GitProjectPayload) {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dockgeek-git-preview-"));
    try {
        for (const file of payload.deletedFiles ?? []) {
            if (!(await fs.lstat(path.join(ctx.dir, file))).isFile()) {
                throw new ValidationError("File to delete missing");
            }
        }
        for (const rename of payload.renames ?? []) {
            if (!(await fs.lstat(path.join(ctx.dir, rename.from))).isFile() || await fs.lstat(path.join(ctx.dir, rename.to)).then(() => true, () => false)) {
                throw new ValidationError("Invalid rename source or destination");
            }
        }
        for (const file of Object.keys(payload.modifiedFiles ?? {})) {
            await regularOrMissing(ctx.dir, file);
        }
        const index = path.join(temp, "index");
        await run(ctx.root, [ "read-tree", ctx.head ], { index });
        const ignored: string[] = [];
        for (const file of ctx.files) {
            const relative = path.relative(ctx.root, path.join(ctx.dir, file));
            const tracked = !!await run(ctx.root, [ "ls-tree", "--name-only", ctx.head, "--", relative ]);
            const isIgnored = !tracked && await run(ctx.root, [ "check-ignore", "-q", "--", relative ]).then(() => true, () => false);
            if (isIgnored) {
                ignored.push(relative);
                continue;
            }
            const removed = (payload.deletedFiles ?? []).includes(file) || (payload.renames ?? []).some(rename => rename.from === file);
            let next: string | undefined;
            if (!removed) {
                if (file === payload.filename) {
                    next = payload.composeYAML;
                } else if (file === ".env") {
                    const exists = await fs.lstat(path.join(ctx.dir, file)).then(() => true, () => false);
                    next = payload.composeENV.trim() || exists ? payload.composeENV : undefined;
                } else if (Object.hasOwn(payload.draftFiles ?? {}, file)) {
                    next = payload.draftFiles[file];
                } else if (Object.hasOwn(payload.modifiedFiles ?? {}, file)) {
                    next = payload.modifiedFiles![file];
                } else {
                    const rename = (payload.renames ?? []).find(item => item.to === file);
                    if (rename) {
                        next = await fs.readFile(path.join(ctx.dir, rename.from), "utf8");
                    }
                }
            }
            if (next === undefined && !removed) {
                continue;
            }
            if (next === undefined) {
                await run(ctx.root, [ "update-index", "--force-remove", "--", relative ], { index });
            } else {
                const blob = await run(ctx.root, [ "hash-object", "-w", "--stdin" ], { input: next });
                await run(ctx.root, [ "update-index", "--add", "--cacheinfo", `100644,${blob},${relative}` ], { index });
            }
        }
        const tree = await run(ctx.root, [ "write-tree" ], { index });
        const raw = await run(ctx.root, [ "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--unified=3", ctx.head, tree, "--", ...ctx.files.map(file => path.relative(ctx.root, path.join(ctx.dir, file))) ]);
        const names = await run(ctx.root, [ "diff", "--no-renames", "--name-status", ctx.head, tree, "--", ...ctx.files.map(file => path.relative(ctx.root, path.join(ctx.dir, file))) ]);
        const changes: GitChange[] = names ? names.split("\n").map(line => {
            const [ status, file ] = line.split("\t");
            const header = `diff --git a/${file} b/${file}`;
            const start = raw.indexOf(header);
            const end = raw.indexOf("\ndiff --git ", start + header.length);
            return { path: file, type: status === "A" ? "create" : status === "D" ? "delete" : "modify", diff: start < 0 ? "" : raw.slice(start, end < 0 ? undefined : end) };
        }) : [];
        return { tree, changes, ignored };
    } finally {
        await fs.rm(temp, { recursive: true, force: true });
    }
}

export async function previewGitProject(server: DockgeekServer, payload: GitProjectPayload) {
    let ctx: Awaited<ReturnType<typeof context>>;
    try {
        ctx = await context(server, payload);
    } catch (error) {
        if (error instanceof ValidationError && error.message === "Not a Git repository") {
            return { ok: false, notGit: true, code: "NOT_GIT_REPOSITORY" };
        }
        throw error;
    }
    const staged = await stageChanges(ctx, payload);
    const id = randomUUID();
    const preview: Preview = { ...ctx, tree: staged.tree, payload: structuredClone(payload), fingerprint: await fingerprint(ctx.root, ctx.dir, ctx.files, ctx.head), expires: Date.now() + 5 * 60_000 };
    previews.set(id, preview);
    return { previewId: id, repository: ctx.root, branch: ctx.branch, remote: ctx.remote, changes: staged.changes, ignored: staged.ignored, deploy: !!payload.deploy, expires: preview.expires };
}

export async function applyGitProject(server: DockgeekServer, payload: GitProjectPayload, deploy: (project: Project) => Promise<void>) {
    const preview = previews.get(payload.previewId || "");
    if (!preview || preview.expires < Date.now()) {
        throw new ValidationError("Git preview expired; preview again");
    }
    if (active.has(preview.root)) {
        throw new ValidationError("Another Git operation is in progress");
    }
    active.add(preview.root);
    try {
        if (JSON.stringify({ ...payload, previewId: undefined }) !== JSON.stringify({ ...preview.payload, previewId: undefined })) {
            throw new ValidationError("Git preview changed; preview again");
        }
        const ctx = await context(server, payload);
        if (ctx.root !== preview.root || ctx.dir !== preview.dir || ctx.branch !== preview.branch || ctx.head !== preview.head || ctx.remote !== preview.remote || ctx.remoteRef !== preview.remoteRef || await fingerprint(ctx.root, ctx.dir, ctx.files, ctx.head) !== preview.fingerprint) {
            throw new ValidationError("Git preview is stale; preview again");
        }
        const staged = await stageChanges(ctx, payload);
        if (staged.tree !== preview.tree) {
            throw new ValidationError("Git preview is stale; preview again");
        }
        previews.delete(payload.previewId!);
        const project = payload.isAdd ? new Project(server, payload.name, payload.composeYAML, payload.composeENV) : await Project.getProject(server, payload.name);
        project.setComposeFileName(payload.filename);
        project.setComposeContent(payload.composeYAML, payload.composeENV);
        if (!payload.isAdd) {
            project.validate();
        }
        for (const file of payload.deletedFiles ?? []) {
            if (!(await fs.stat(path.join(ctx.dir, file))).isFile()) {
                throw new ValidationError("File to delete missing");
            }
        }
        for (const rename of payload.renames ?? []) {
            if (!(await fs.stat(path.join(ctx.dir, rename.from))).isFile()) {
                throw new ValidationError("File to rename missing");
            }
            if (await fs.lstat(path.join(ctx.dir, rename.to)).then(() => true, () => false)) {
                throw new ValidationError("Rename destination exists");
            }
        }
        await project.save(payload.isAdd);
        for (const [ file, content ] of Object.entries(payload.draftFiles ?? {})) {
            await fs.writeFile(path.join(ctx.dir, file), content, { flag: "wx", mode: 0o600 });
        }
        for (const rename of payload.renames ?? []) {
            await fs.rename(path.join(ctx.dir, rename.from), path.join(ctx.dir, rename.to));
        }
        for (const [ file, content ] of Object.entries(payload.modifiedFiles ?? {})) {
            const target = path.join(ctx.dir, file);
            await regularOrMissing(ctx.dir, file);
            await fs.writeFile(target, content, { flag: "w", mode: 0o600 });
        }
        for (const file of payload.deletedFiles ?? []) {
            await fs.unlink(path.join(ctx.dir, file));
        }
        const oldTree = await run(ctx.root, [ "rev-parse", `${ctx.head}^{tree}` ]);
        if (preview.tree === oldTree) {
            if (payload.deploy) {
                await deploy(project);
            }
            return { projectName: project.name, projectDir: project.fullPath, commit: null, deployed: !!payload.deploy };
        }
        const commit = await run(ctx.root, [ "commit-tree", preview.tree, "-p", ctx.head, "-F", "-" ], { input: `Update project ${project.name}\n` });
        // Push the exact previewed commit before advancing HEAD. A failed push can then be retried.
        await push(preview, server, commit);
        await run(ctx.root, [ "update-ref", ctx.branch, commit, ctx.head ]);
        await alignUnstagedIndex(ctx.root, ctx.head, commit, staged.changes.map(change => change.path));
        if (payload.deploy) {
            await deploy(project);
        }
        return { projectName: project.name, projectDir: project.fullPath, commit, deployed: !!payload.deploy };
    } finally {
        active.delete(preview.root);
    }
}

export async function gitRootForProject(server: DockgeekServer, name: string): Promise<string> {
    const base = await fs.realpath(server.projectsDir);
    if (name === "") {
        if (await repositoryRoot(base, base, true)) {
            return base;
        }
        throw new ValidationError("Git repository must be inside projects directory");
    }
    if (typeof name !== "string") {
        throw new ValidationError("Project name must be a string");
    }
    const project = await Project.getProject(server, name);
    const dir = await fs.realpath(project.fullPath);
    if (!project.isManagedByDockgeek || !Project.isPathInside(base, dir)) {
        throw new ValidationError("Project is not managed here");
    }
    const root = await repositoryRoot(base, dir, false);
    if (!root) {
        throw new ValidationError("Git repository must be inside projects directory");
    }
    return root;
}
