import assert from "node:assert/strict";
import fs from "node:fs";
import { promises as fsAsync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { Project } from "./project";
import { DockgeekServer } from "./dockge-server";
import { DockerSocketHandler } from "./agent-socket-handlers/docker-socket-handler";
import { DEFAULT_COMPOSE_FILE_PATTERNS, DEFAULT_EDITABLE_FILE_PATTERNS } from "../common/util-common";

describe("project .env persistence", () => {
    const originalGetComposeProjects = Project.getComposeProjects;
    let tmpRoot: string;
    let projectsDir: string;
    let server: DockgeekServer;

    before(() => {
        Project.getComposeProjects = async () => [];
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dockgeek-env-persist-"));
        projectsDir = path.join(tmpRoot, "projects");
        fs.mkdirSync(projectsDir);
        server = { projectsDir, composeFilePatterns: DEFAULT_COMPOSE_FILE_PATTERNS, editableFilePatterns: DEFAULT_EDITABLE_FILE_PATTERNS } as DockgeekServer;
    });

    after(() => {
        Project.getComposeProjects = originalGetComposeProjects;
        fs.rmSync(tmpRoot, {
            recursive: true,
            force: true,
        });
    });

    test("save creates nonempty .env and updates existing content", async () => {
        const project = new Project(server, "env-create", "services:\n  web:\n    image: nginx\n", "FOO=bar\n");
        await project.save(true);
        const envPath = path.join(projectsDir, "env-create", ".env");
        assert.equal(fs.readFileSync(envPath, "utf-8"), "FOO=bar\n");

        const updated = new Project(server, "env-create", "services:\n  web:\n    image: nginx\n", "FOO=baz\nBAR=1\n");
        await updated.save(false);
        assert.equal(fs.readFileSync(envPath, "utf-8"), "FOO=baz\nBAR=1\n");
    });

    test("save clears an existing .env but does not create one for whitespace-only input", async () => {
        const project = new Project(server, "env-clear", "services:\n  web:\n    image: nginx\n", "KEEP=1\n");
        await project.save(true);
        const envPath = path.join(projectsDir, "env-clear", ".env");
        assert.equal(fs.existsSync(envPath), true);

        const cleared = new Project(server, "env-clear", "services:\n  web:\n    image: nginx\n", "");
        await cleared.save(false);
        assert.equal(fs.readFileSync(envPath, "utf-8"), "");

        const missingName = "env-missing";
        const missing = new Project(server, missingName, "services:\n  web:\n    image: nginx\n", "   \n");
        await missing.save(true);
        assert.equal(fs.existsSync(path.join(projectsDir, missingName, ".env")), false);
        assert.equal(fs.existsSync(path.join(projectsDir, missingName, "compose.yaml")), true);

        const handler = new DockerSocketHandler();
        assert.equal((await handler.listEditableFiles(server, missing)).includes(".env"), false);
        assert.equal((await handler.listEditableFiles(server, cleared)).includes(".env"), true);
    });

    test("editable files exclude the active Compose file and schema files", async () => {
        const project = new Project(server, "file-tabs", "services:\n  web:\n    image: nginx\n", "");
        await project.save(true);
        for (const filename of [ "settings.yaml", "settings.json", "settings.schema.yaml", "settings.schema.yml", "settings.schema.json" ]) {
            fs.writeFileSync(path.join(project.fullPath, filename), "{}\n");
        }
        const files = await new DockerSocketHandler().listEditableFiles(server, project);
        assert.equal(files.includes("compose.yaml"), false);
        assert.equal(files.includes("settings.yaml"), true);
        assert.equal(files.includes("settings.json"), true);
        for (const filename of [ "settings.schema.yaml", "settings.schema.yml", "settings.schema.json" ]) {
            assert.equal(files.includes(filename), false, filename);
        }
    });

    test("save applies PUID/PGID ownership to compose and .env when both are set", async () => {
        if (typeof process.getuid !== "function" || typeof process.getgid !== "function" || process.getuid() !== 0) {
            // Ownership changes require root; verify the write path still succeeds without them.
            const project = new Project(server, "env-owner", "services:\n  web:\n    image: nginx\n", "A=1\n");
            await project.save(true);
            assert.equal(fs.readFileSync(path.join(projectsDir, "env-owner", ".env"), "utf-8"), "A=1\n");
            return;
        }

        const uid = process.getuid();
        const gid = process.getgid();
        const previousPuid = process.env.PUID;
        const previousPgid = process.env.PGID;
        process.env.PUID = String(uid);
        process.env.PGID = String(gid);
        try {
            const project = new Project(server, "env-owner", "services:\n  web:\n    image: nginx\n", "A=1\n");
            await project.save(true);
            const envStat = await fsAsync.stat(path.join(projectsDir, "env-owner", ".env"));
            assert.equal(envStat.uid, uid);
            assert.equal(envStat.gid, gid);
        } finally {
            if (previousPuid === undefined) {
                delete process.env.PUID;
            } else {
                process.env.PUID = previousPuid;
            }
            if (previousPgid === undefined) {
                delete process.env.PGID;
            } else {
                process.env.PGID = previousPgid;
            }
        }
    });
});
