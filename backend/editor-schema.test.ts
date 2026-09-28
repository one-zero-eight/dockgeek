import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FileManager } from "./file-manager";
import { DockgeekServer } from "./dockge-server";
import { EditorSchemaError, parseEditorSchemaAllowedPrefixes, pinnedSchemaLookup, publicAddress, readEditorSchema } from "./editor-schema";
import { AgentSocket } from "../common/agent-socket";
import { FileManagerSocketHandler } from "./agent-socket-handlers/file-manager-socket-handler";
import { DockgeekSocket } from "./util-server";
import { Settings } from "./settings";
import { Project } from "./project";
import { DEFAULT_COMPOSE_FILE_PATTERNS, DEFAULT_EDITABLE_FILE_PATTERNS } from "../common/util-common";

function hasCode(code: string) {
    return (error: unknown) => error instanceof EditorSchemaError && error.code === code;
}

test("schema prefix settings require constrained HTTPS directory prefixes", () => {
    assert.deepEqual(parseEditorSchemaAllowedPrefixes("https://schemas.example.org/team/\n"), [ "https://schemas.example.org/team/" ]);
    for (const value of [
        "http://example.org/", "https://localhost:8080/x/", "https://127.0.0.1/", "https://8.8.8.8/",
        "https://[2606:4700:4700::1111]/", "https://0x7f000001/", "https://example.org/path/*",
        "https://example.org/%2e%2e/", "https://example.org/path?x=1", "https://user@example.org/",
    ]) {
        assert.throws(() => parseEditorSchemaAllowedPrefixes(value), hasCode("VALIDATION"));
    }
});

test("only globally routable IP addresses are allowed for remote schemas", () => {
    for (const address of [ "8.8.8.8", "1.1.1.1", "2606:4700:4700::1111" ]) {
        assert.equal(publicAddress(address), true, address);
    }
    for (const address of [
        "not-an-ip", "0.0.0.0", "10.1.2.3", "100.64.1.1", "127.0.0.1",
        "169.254.169.254", "172.16.0.1", "192.0.2.1", "192.168.1.1",
        "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1",
        "240.0.0.1", "255.255.255.255", "::", "::1", "::ffff:127.0.0.1",
        "64:ff9b::7f00:1", "100::1", "2001:db8::1", "2002::1",
        "fc00::1", "fe80::1", "ff02::1",
    ]) {
        assert.equal(publicAddress(address), false, address);
    }
});

test("HTTPS connections keep the validated address with or without all-address lookup", async () => {
    const address = { address: "8.8.8.8", family: 4 };
    const lookup = pinnedSchemaLookup(address)!;
    const single = await new Promise<unknown>((resolve, reject) => lookup("raw.githubusercontent.com", { all: false }, (error, result) => error ? reject(error) : resolve(result)));
    const all = await new Promise<unknown>((resolve, reject) => lookup("raw.githubusercontent.com", { all: true }, (error, result) => error ? reject(error) : resolve(result)));
    assert.equal(single, address.address);
    assert.deepEqual(all, [ address ]);
});

test("readEditorSchema socket requires authentication", async () => {
    const agentSocket = new AgentSocket();
    const socket = { endpoint: "", on: () => {} } as unknown as DockgeekSocket;
    const server = { config: { fileManagerMaxFileSize: 1024 } } as DockgeekServer;
    new FileManagerSocketHandler().create(socket, server, agentSocket);
    const result = await new Promise<{ ok: boolean; code: string }>(resolve => {
        agentSocket.call("readEditorSchema", { source: "files", path: "test.yaml", schemaUrl: "https://raw.githubusercontent.com/example/test/schema.json" }, resolve);
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "SCHEMA_ERROR");
});

test("GitHub blob URLs are denied rather than rewritten to raw URLs", async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dockgeek-schema-"));
    const projectsDir = path.join(temporary, "projects");
    const filesDir = path.join(temporary, "files");
    await fs.mkdir(projectsDir);
    await fs.mkdir(filesDir);
    await fs.writeFile(path.join(filesDir, "document.yaml"), "schema: test");
    const server = { projectsDir, fileManager: new FileManager(filesDir, 1024) } as DockgeekServer;
    const originalGet = Settings.get;
    Settings.get = async () => "";
    try {
        await assert.rejects(readEditorSchema(server, {
            source: "files", path: "document.yaml", schemaUrl: "https://github.com/one-zero-eight/monorepo/blob/main/settings.schema.yaml",
        }), hasCode("SCHEMA_URL_DENIED"));
    } finally {
        Settings.get = originalGet;
        await fs.rm(temporary, { recursive: true, force: true });
    }
});

test("HTTPS schema URLs with IP-literal hosts are denied before DNS lookup", async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dockgeek-schema-"));
    const projectsDir = path.join(temporary, "projects");
    const filesDir = path.join(temporary, "files");
    await fs.mkdir(projectsDir);
    await fs.mkdir(filesDir);
    await fs.writeFile(path.join(filesDir, "document.yaml"), "schema: test");
    const server = { projectsDir, fileManager: new FileManager(filesDir, 1024) } as DockgeekServer;
    const originalGet = Settings.get;
    Settings.get = async () => "";
    try {
        for (const schemaUrl of [
            "https://127.0.0.1/schema.json", "https://8.8.8.8/schema.json",
            "https://[2606:4700:4700::1111]/schema.json", "https://0x7f000001/schema.json",
        ]) {
            await assert.rejects(readEditorSchema(server, {
                source: "files", path: "document.yaml", schemaUrl,
            }), hasCode("SCHEMA_URL_DENIED"));
        }
    } finally {
        Settings.get = originalGet;
        await fs.rm(temporary, { recursive: true, force: true });
    }
});

test("root-relative remote refs stay HTTPS and pass through the fetch allowlist", async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dockgeek-schema-"));
    const projectsDir = path.join(temporary, "projects");
    const filesDir = path.join(temporary, "files");
    await fs.mkdir(projectsDir);
    await fs.mkdir(filesDir);
    await fs.writeFile(path.join(filesDir, "document.yaml"), "schema: test");
    const server = { projectsDir, fileManager: new FileManager(filesDir, 1024) } as DockgeekServer;
    const originalGet = Settings.get;
    Settings.get = async () => "";
    try {
        await assert.rejects(readEditorSchema(server, {
            source: "files", path: "document.yaml", baseUri: "https://untrusted.example/schema.json", schemaUrl: "/private/ref.json",
        }), hasCode("SCHEMA_URL_DENIED"));
    } finally {
        Settings.get = originalGet;
        await fs.rm(temporary, { recursive: true, force: true });
    }
});

test("project schema requests use projectName and restrict local schemas to the projects root", async () => {
    const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "dockgeek-project-schema-")));
    const projectsDir = path.join(temporary, "projects");
    const projectDir = path.join(projectsDir, "demo");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, "compose.yaml"), "services: {}\n");
    await fs.writeFile(path.join(projectDir, "settings.yaml"), "schema: test\n");
    await fs.writeFile(path.join(projectDir, "settings.schema.yaml"), "type: string\n");
    await fs.writeFile(path.join(projectsDir, "outside.schema.yaml"), "type: boolean\n");
    const server = {
        projectsDir,
        composeFilePatterns: DEFAULT_COMPOSE_FILE_PATTERNS,
        editableFilePatterns: DEFAULT_EDITABLE_FILE_PATTERNS,
    } as DockgeekServer;
    const originalGetProject = Project.getProject;
    Project.getProject = async (_server, name) => {
        Project.validateName(name);
        return new Project(server, name);
    };
    try {
        const request = { source: "project" as const, projectName: "demo", filename: "settings.yaml", schemaUrl: "settings.schema.yaml" };
        const result = await readEditorSchema(server, request);
        assert.equal(result.content, "type: string\n");
        assert.equal(result.uri, pathToFileURL(path.join(projectDir, "settings.schema.yaml")).href);
        // A new project file must resolve its schema before the first save.
        await fs.rm(path.join(projectDir, "settings.yaml"));
        assert.equal((await readEditorSchema(server, request)).content, "type: string\n");
        await fs.symlink(path.join(projectsDir, "outside.schema.yaml"), path.join(projectDir, "settings.yaml"));
        await assert.rejects(readEditorSchema(server, request), hasCode("SCHEMA_PATH_DENIED"));
        await fs.rm(path.join(projectDir, "settings.yaml"));
        assert.equal((await readEditorSchema(server, { ...request, schemaUrl: "../outside.schema.yaml" })).content, "type: boolean\n");
        await assert.rejects(readEditorSchema(server, { ...request, schemaUrl: "../../outside.schema.yaml" }), hasCode("SCHEMA_PATH_DENIED"));
        await assert.rejects(readEditorSchema(server, { ...request, source: "invalid" as "project" }), hasCode("VALIDATION"));
        await assert.rejects(readEditorSchema(server, { ...request, projectName: "../demo" }), error =>
            error instanceof Error && /Invalid managed project document|Project name/.test(error.message));
    } finally {
        Project.getProject = originalGetProject;
        await fs.rm(temporary, { recursive: true, force: true });
    }
});

test("local schema reads honor the projects root even for Files documents elsewhere", async () => {
    const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "dockgeek-schema-")));
    const projectsDir = path.join(temporary, "projects");
    const filesDir = path.join(temporary, "files");
    await fs.mkdir(path.join(projectsDir, "shared"), { recursive: true });
    await fs.mkdir(filesDir);
    await fs.writeFile(path.join(filesDir, "document.yaml"), "schema: test");
    await fs.writeFile(path.join(filesDir, "secret.json"), "secret");
    await fs.writeFile(path.join(projectsDir, "shared", "schema.json"), "{\"type\":\"string\"}");
    const server = { projectsDir, fileManager: new FileManager(filesDir, 2 * 1024 * 1024) } as DockgeekServer;
    const request = { source: "files" as const, path: "document.yaml", schemaUrl: path.join(projectsDir, "shared", "schema.json") };
    try {
        const first = await readEditorSchema(server, request);
        assert.equal(first.content, "{\"type\":\"string\"}");
        assert.equal(first.uri, pathToFileURL(request.schemaUrl).href);
        await fs.writeFile(path.join(projectsDir, "root.json"), "root");
        assert.equal((await readEditorSchema(server, { ...request, schemaUrl: "../root.json", baseUri: pathToFileURL(path.join(projectsDir, "shared", "schema.json")).href })).content, "root");
        await assert.rejects(readEditorSchema(server, { ...request, schemaUrl: "secret.json" }), hasCode("SCHEMA_PATH_DENIED"));
        await assert.rejects(readEditorSchema(server, { ...request, schemaUrl: path.join(filesDir, "secret.json") }), hasCode("SCHEMA_PATH_DENIED"));
        await assert.rejects(readEditorSchema(server, { ...request, path: "../projects/shared/schema.json" }), error =>
            (error as { code?: string }).code === "PATH_OUTSIDE_ROOT");
        await fs.symlink(path.join(filesDir, "secret.json"), path.join(projectsDir, "shared", "escape.json"));
        await assert.rejects(readEditorSchema(server, { ...request, schemaUrl: path.join(projectsDir, "shared", "escape.json") }), hasCode("SCHEMA_PATH_DENIED"));
        await fs.writeFile(path.join(projectsDir, "shared", "binary.json"), Buffer.from([ 0xff ]));
        await assert.rejects(readEditorSchema(server, { ...request, schemaUrl: path.join(projectsDir, "shared", "binary.json") }), hasCode("SCHEMA_ENCODING"));
        await fs.writeFile(path.join(projectsDir, "shared", "large.json"), Buffer.alloc(1024 * 1024 + 1));
        await assert.rejects(readEditorSchema(server, { ...request, schemaUrl: path.join(projectsDir, "shared", "large.json") }), hasCode("SCHEMA_SIZE"));
    } finally {
        await fs.rm(temporary, { recursive: true, force: true });
    }
});
