import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { Stack } from "./stack";
import { Terminal } from "./terminal";
import { DockgeServer } from "./dockge-server";
import { DockgeSocket, ValidationError } from "./util-server";
import { DEFAULT_COMPOSE_FILE_PATTERNS, DEFAULT_EDITABLE_FILE_PATTERNS, filePatterns, matchesFilePatterns, preferredMatchingFile } from "../common/util-common";

const STACK_NAME_ALLOW_LIST = /^[a-z0-9_-]+$/;
const SECRET_TOKEN = "POC_TOKEN_ff2a7ee07e511fac5e1e03333e298575";
const SECRET_ENV = `SECRET=${SECRET_TOKEN}\n`;
const COMPOSE_YAML = "services:\n  poc:\n    image: hello-world\n";

describe("stack name path traversal", () => {
    let tmpRoot: string;
    let stacksDir: string;
    let outsideDir: string;
    let server: DockgeServer;
    const traversalName = "../outside";

    function seedOutsideDir() {
        fs.mkdirSync(outsideDir, {
            recursive: true,
        });
        fs.writeFileSync(path.join(outsideDir, ".env"), SECRET_ENV);
        fs.writeFileSync(path.join(outsideDir, "compose.yaml"), COMPOSE_YAML);
    }

    before(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-stack-traversal-"));
        stacksDir = path.join(tmpRoot, "stacks");
        outsideDir = path.join(tmpRoot, "outside");
        fs.mkdirSync(stacksDir);
        seedOutsideDir();
        server = { stacksDir, composeFilePatterns: DEFAULT_COMPOSE_FILE_PATTERNS } as DockgeServer;
    });

    after(() => {
        fs.rmSync(tmpRoot, {
            recursive: true,
            force: true,
        });
    });

    test("path.join(stacksDir, name) escapes stacksDir when name fails the allow-list", () => {
        assert.equal(Boolean(traversalName.match(STACK_NAME_ALLOW_LIST)), false);
        const joined = path.resolve(path.join(stacksDir, traversalName));
        const stacksResolved = path.resolve(stacksDir);
        assert.equal(joined, path.resolve(outsideDir));
        assert.equal(joined === stacksResolved || joined.startsWith(stacksResolved + path.sep), false);
    });

    test("getStack must not read compose files outside stacksDir via a ../ stack name", async () => {
        seedOutsideDir();
        let composeENV = "";
        let composeYAML = "";
        try {
            const stack = await Stack.getStack(server, traversalName);
            composeENV = stack.composeENV;
            composeYAML = stack.composeYAML;
        } catch (e) {
            assert.ok(e instanceof ValidationError);
            assert.match(e.message, /Stack name/);
        }
        assert.equal(composeENV.includes(SECRET_TOKEN), false);
        assert.equal(composeYAML.includes("hello-world"), false);
    });

    test("deleteStack must not recursively remove a traversed path", async () => {
        seedOutsideDir();
        const origExec = Terminal.exec;
        Terminal.exec = async () => {
            return 0;
        };
        try {
            try {
                const stack = await Stack.getStack(server, traversalName);
                await stack.delete({
                    endpoint: "",
                } as DockgeSocket);
            } catch (e) {
                assert.ok(e instanceof ValidationError);
                assert.match(e.message, /Stack name/);
            }
            assert.equal(fs.existsSync(outsideDir), true);
            assert.equal(fs.readFileSync(path.join(outsideDir, ".env"), "utf-8"), SECRET_ENV);
        } finally {
            Terminal.exec = origExec;
        }
    });

    test("getStack rejects slash, backslash, empty and non-string names", async () => {
        for (const name of [ "a/b", "a\\b", "", "UPPER", "has.dot" ]) {
            await assert.rejects(() => Stack.getStack(server, name), (e: unknown) => {
                assert.ok(e instanceof ValidationError);
                return true;
            });
        }
        await assert.rejects(() => Stack.getStack(server, null as unknown as string), (e: unknown) => {
            assert.ok(e instanceof ValidationError);
            return true;
        });
        await assert.rejects(() => Stack.getStack(server, undefined as unknown as string), (e: unknown) => {
            assert.ok(e instanceof ValidationError);
            return true;
        });
    });

    test("default patterns cover Compose filenames and common env files", () => {
        for (const filename of [ "compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml", "compose.dev.yaml", "compose.dev.yml", "docker-compose.dev.yaml", "docker-compose.dev.yml" ]) {
            assert.equal(matchesFilePatterns(filename, DEFAULT_COMPOSE_FILE_PATTERNS), true, filename);
        }
        for (const filename of [ ".env", ".env.local", "app.env", "app.prod.env", "settings.yaml", "app.settings.yaml" ]) {
            assert.equal(matchesFilePatterns(filename, DEFAULT_EDITABLE_FILE_PATTERNS), true, filename);
        }
        for (const filename of [ "secret.txt", "env", "config.env.backup", "nested/.env" ]) {
            assert.equal(matchesFilePatterns(filename, DEFAULT_EDITABLE_FILE_PATTERNS), false, filename);
        }
        assert.equal(matchesFilePatterns("nested/compose.yaml", DEFAULT_COMPOSE_FILE_PATTERNS), false);
        assert.deepEqual(filePatterns("{,docker-}compose{,.*}.y{a,}ml, .env"), [ "{,docker-}compose{,.*}.y{a,}ml", ".env" ]);
        assert.equal(matchesFilePatterns("compose.dev.yaml", "{compose,docker-compose}.@(yaml|yml)"), false);
        assert.equal(matchesFilePatterns("compose.yml", "{compose,docker-compose}.@(yaml|yml)"), true);
        assert.equal(preferredMatchingFile([ "compose.dev.yaml", "docker-compose.yml", "compose.yaml" ], DEFAULT_COMPOSE_FILE_PATTERNS), "compose.yaml");
        assert.equal(preferredMatchingFile([ "compose.dev.yaml", "docker-compose.yml" ], DEFAULT_COMPOSE_FILE_PATTERNS), "docker-compose.yml");
    });

    test("getStack prefers compose.yaml over other matching files", async () => {
        const dir = path.join(stacksDir, "preferred-compose");
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, "compose.dev.yaml"), "services:\n  dev:\n    image: busybox\n");
        fs.writeFileSync(path.join(dir, "compose.yaml"), COMPOSE_YAML);
        const stack = await Stack.getStack(server, "preferred-compose");
        assert.equal(path.basename(stack.composeFilePath), "compose.yaml");
        assert.equal(stack.composeYAML, COMPOSE_YAML);
    });

    test("getStack still loads a stack whose name is on the allow-list", async () => {
        const name = "ok-stack_1";
        const dir = path.join(stacksDir, name);
        fs.mkdirSync(dir, {
            recursive: true,
        });
        fs.writeFileSync(path.join(dir, ".env"), "FOO=bar\n");
        fs.writeFileSync(path.join(dir, "compose.yaml"), "services:\n  web:\n    image: nginx\n");
        const stack = await Stack.getStack(server, name);
        assert.equal(stack.name, name);
        assert.equal(stack.composeENV.includes("FOO=bar"), true);
        assert.equal(stack.composeYAML.includes("nginx"), true);
    });
});
