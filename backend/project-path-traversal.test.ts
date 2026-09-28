import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { Project } from "./project";
import { Terminal } from "./terminal";
import { DockgeekServer } from "./dockge-server";
import { DockgeekSocket, ValidationError } from "./util-server";
import { DEFAULT_COMPOSE_FILE_PATTERNS, DEFAULT_EDITABLE_FILE_PATTERNS, filePatterns, matchesFilePatterns, preferredMatchingFile } from "../common/util-common";

const PROJECT_NAME_ALLOW_LIST = /^[a-z0-9_-]+$/;
const SECRET_TOKEN = "POC_TOKEN_ff2a7ee07e511fac5e1e03333e298575";
const SECRET_ENV = `SECRET=${SECRET_TOKEN}\n`;
const COMPOSE_YAML = "services:\n  poc:\n    image: hello-world\n";

describe("project name path traversal", () => {
    let tmpRoot: string;
    let projectsDir: string;
    let outsideDir: string;
    let server: DockgeekServer;
    const traversalName = "../outside";

    function seedOutsideDir() {
        fs.mkdirSync(outsideDir, {
            recursive: true,
        });
        fs.writeFileSync(path.join(outsideDir, ".env"), SECRET_ENV);
        fs.writeFileSync(path.join(outsideDir, "compose.yaml"), COMPOSE_YAML);
    }

    before(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dockgeek-project-traversal-"));
        projectsDir = path.join(tmpRoot, "projects");
        outsideDir = path.join(tmpRoot, "outside");
        fs.mkdirSync(projectsDir);
        seedOutsideDir();
        server = { projectsDir, composeFilePatterns: DEFAULT_COMPOSE_FILE_PATTERNS } as DockgeekServer;
    });

    after(() => {
        fs.rmSync(tmpRoot, {
            recursive: true,
            force: true,
        });
    });

    test("path.join(projectsDir, name) escapes projectsDir when name fails the allow-list", () => {
        assert.equal(Boolean(traversalName.match(PROJECT_NAME_ALLOW_LIST)), false);
        const joined = path.resolve(path.join(projectsDir, traversalName));
        const projectsResolved = path.resolve(projectsDir);
        assert.equal(joined, path.resolve(outsideDir));
        assert.equal(joined === projectsResolved || joined.startsWith(projectsResolved + path.sep), false);
    });

    test("getProject must not read compose files outside projectsDir via a ../ project name", async () => {
        seedOutsideDir();
        let composeENV = "";
        let composeYAML = "";
        try {
            const project = await Project.getProject(server, traversalName);
            composeENV = project.composeENV;
            composeYAML = project.composeYAML;
        } catch (e) {
            assert.ok(e instanceof ValidationError);
            assert.match(e.message, /Project name/);
        }
        assert.equal(composeENV.includes(SECRET_TOKEN), false);
        assert.equal(composeYAML.includes("hello-world"), false);
    });

    test("deleteProject must not recursively remove a traversed path", async () => {
        seedOutsideDir();
        const origExec = Terminal.exec;
        Terminal.exec = async () => {
            return 0;
        };
        try {
            try {
                const project = await Project.getProject(server, traversalName);
                await project.delete({
                    endpoint: "",
                } as DockgeekSocket);
            } catch (e) {
                assert.ok(e instanceof ValidationError);
                assert.match(e.message, /Project name/);
            }
            assert.equal(fs.existsSync(outsideDir), true);
            assert.equal(fs.readFileSync(path.join(outsideDir, ".env"), "utf-8"), SECRET_ENV);
        } finally {
            Terminal.exec = origExec;
        }
    });

    test("getProject rejects slash, backslash, empty and non-string names", async () => {
        for (const name of [ "a/b", "a\\b", "", "UPPER", "has.dot" ]) {
            await assert.rejects(() => Project.getProject(server, name), (e: unknown) => {
                assert.ok(e instanceof ValidationError);
                return true;
            });
        }
        await assert.rejects(() => Project.getProject(server, null as unknown as string), (e: unknown) => {
            assert.ok(e instanceof ValidationError);
            return true;
        });
        await assert.rejects(() => Project.getProject(server, undefined as unknown as string), (e: unknown) => {
            assert.ok(e instanceof ValidationError);
            return true;
        });
    });

    test("default patterns cover Compose filenames and common env files", () => {
        for (const filename of [ "compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml", "compose.dev.yaml", "compose.dev.yml", "docker-compose.dev.yaml", "docker-compose.dev.yml" ]) {
            assert.equal(matchesFilePatterns(filename, DEFAULT_COMPOSE_FILE_PATTERNS), true, filename);
        }
        for (const filename of [ ".env", ".env.local", "app.env", "app.prod.env", "settings.yaml", "settings.yml", "settings.json", "app.settings.yaml" ]) {
            assert.equal(matchesFilePatterns(filename, DEFAULT_EDITABLE_FILE_PATTERNS), true, filename);
        }
        for (const filename of [ "secret.txt", "env", "config.env.backup", "nested/.env", "settings.schema.yaml", "settings.schema.yml", "settings.schema.json" ]) {
            assert.equal(matchesFilePatterns(filename, DEFAULT_EDITABLE_FILE_PATTERNS), false, filename);
        }
        assert.equal(matchesFilePatterns("nested/compose.yaml", DEFAULT_COMPOSE_FILE_PATTERNS), false);
        assert.deepEqual(filePatterns("{,docker-}compose{,.*}.y{a,}ml, .env"), [ "{,docker-}compose{,.*}.y{a,}ml", ".env" ]);
        assert.equal(matchesFilePatterns("compose.dev.yaml", "{compose,docker-compose}.@(yaml|yml)"), false);
        assert.equal(matchesFilePatterns("compose.yml", "{compose,docker-compose}.@(yaml|yml)"), true);
        assert.equal(preferredMatchingFile([ "compose.dev.yaml", "docker-compose.yml", "compose.yaml" ], DEFAULT_COMPOSE_FILE_PATTERNS), "compose.yaml");
        assert.equal(preferredMatchingFile([ "compose.dev.yaml", "docker-compose.yml" ], DEFAULT_COMPOSE_FILE_PATTERNS), "docker-compose.yml");
    });

    test("getProject prefers compose.yaml over other matching files", async () => {
        const dir = path.join(projectsDir, "preferred-compose");
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, "compose.dev.yaml"), "services:\n  dev:\n    image: busybox\n");
        fs.writeFileSync(path.join(dir, "compose.yaml"), COMPOSE_YAML);
        const project = await Project.getProject(server, "preferred-compose");
        assert.equal(path.basename(project.composeFilePath), "compose.yaml");
        assert.equal(project.composeYAML, COMPOSE_YAML);
    });

    test("getProject still loads a project whose name is on the allow-list", async () => {
        const name = "ok-project_1";
        const dir = path.join(projectsDir, name);
        fs.mkdirSync(dir, {
            recursive: true,
        });
        fs.writeFileSync(path.join(dir, ".env"), "FOO=bar\n");
        fs.writeFileSync(path.join(dir, "compose.yaml"), "services:\n  web:\n    image: nginx\n");
        const project = await Project.getProject(server, name);
        assert.equal(project.name, name);
        assert.equal(project.composeENV.includes("FOO=bar"), true);
        assert.equal(project.composeYAML.includes("nginx"), true);
    });
});
