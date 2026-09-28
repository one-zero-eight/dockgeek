import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { DEFAULT_COMPOSE_FILE_PATTERNS, DEFAULT_EDITABLE_FILE_PATTERNS } from "../common/util-common";
import { DockgeekServer } from "./dockge-server";
import { DockerSocketHandler } from "./agent-socket-handlers/docker-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import { DockgeekSocket } from "./util-server";
import { applyGitProject, deleteGitCredential, gitRootForProject, listGitCredentials, previewGitProject, setGitCredential } from "./git-ops";
import { signGitOpsDelegation } from "./auth";

let tmp: string;
let server: DockgeekServer;
let root: string;
let projectDir: string;
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const payload = () => ({ name: "sample", isAdd: false, filename: "compose.yaml", composeYAML: "services:\n  web:\n    image: alpine:latest\n", composeENV: "TOKEN=changed\n", draftFiles: {}, modifiedFiles: { "settings.yaml": "value: changed\n" }, deletedFiles: [], renames: [], deploy: false });

before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dockgeek-git-ops-test-"));
    root = path.join(tmp, "projects");
    const remote = path.join(tmp, "remote.git");
    projectDir = path.join(root, "sample");
    fs.mkdirSync(projectDir, { recursive: true });
    git(tmp, "init", "--bare", remote);
    const bin = path.join(tmp, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "ssh"), "#!/bin/sh\nfor arg do case \"$arg\" in *git-upload-pack*|*git-receive-pack*) exec sh -c \"$arg\";; esac; done\nexit 1\n", { mode: 0o700 });
    process.env.PATH = `${bin}:${process.env.PATH}`;
    git(tmp, "init", root);
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "Test");
    fs.writeFileSync(path.join(root, ".gitignore"), "**/.env\n");
    fs.writeFileSync(path.join(projectDir, "compose.yaml"), "services:\n  web:\n    image: alpine\n");
    fs.writeFileSync(path.join(projectDir, "settings.yaml"), "value: old\n");
    fs.writeFileSync(path.join(projectDir, "unrelated.yaml"), "unrelated: original\n");
    fs.writeFileSync(path.join(projectDir, ".env"), "TOKEN=old\n");
    git(root, "add", ".");
    git(root, "commit", "-m", "Initial");
    git(root, "remote", "add", "origin", `ssh://localhost${remote}`);
    git(root, "push", "-u", "origin", "HEAD");
    server = { projectsDir: root, config: { dataDir: path.join(tmp, "data") }, composeFilePatterns: DEFAULT_COMPOSE_FILE_PATTERNS, editableFilePatterns: DEFAULT_EDITABLE_FILE_PATTERNS } as DockgeekServer;
    process.env.DOCKGEEK_GIT_CREDENTIALS_DIR = path.join(tmp, "secrets");
});

after(() => {
    delete process.env.DOCKGEEK_GIT_CREDENTIALS_DIR;
    fs.rmSync(tmp, { recursive: true, force: true });
});

test("agent principals cannot access Git credentials or project mutations", async () => {
    const events = new AgentSocket();
    new DockerSocketHandler().create({ principal: { kind: "agent", endpoint: "remote", keyHash: "key" } } as DockgeekSocket, server, events);
    for (const event of [ "previewGitProject", "applyGitProject", "listGitCredentials", "setGitCredential", "deleteGitCredential" ]) {
        const response = await new Promise<{ ok: boolean; msg: string }>(resolve => events.call(event, { name: "sample" }, resolve));
        assert.equal(response.ok, false, event);
        assert.match(response.msg, /Administrator access required/);
    }
});

test("remote GitOps handler rejects missing grants and accepts a signed matching grant", async () => {
    const previousSecret = process.env.DOCKGEEK_GITOPS_PROXY_SECRET;
    process.env.DOCKGEEK_GITOPS_PROXY_SECRET = "a-separate-shared-gitops-secret-32-bytes-long";
    try {
        const events = new AgentSocket();
        const endpoint = "remote.test:5001";
        new DockerSocketHandler().create({ principal: { kind: "agent", endpoint, keyHash: "key" } } as DockgeekSocket, server, events);
        const request = { name: "sample" };
        const denied = await new Promise<{ ok: boolean; msg: string }>(resolve => events.call("listGitCredentials", request, resolve));
        assert.equal(denied.ok, false);
        const grant = signGitOpsDelegation("listGitCredentials", request, endpoint);
        const allowed = await new Promise<{ ok: boolean; configured: boolean }>(resolve => events.call("listGitCredentials", request, grant, resolve));
        assert.equal(allowed.ok, true);
        assert.equal(allowed.configured, false);
        const replay = await new Promise<{ ok: boolean; msg: string }>(resolve => events.call("listGitCredentials", request, grant, resolve));
        assert.equal(replay.ok, false);
    } finally {
        if (previousSecret === undefined) {
            delete process.env.DOCKGEEK_GITOPS_PROXY_SECRET;
        } else {
            process.env.DOCKGEEK_GITOPS_PROXY_SECRET = previousSecret;
        }
    }
});

test("credential storage is private and only returns metadata", async () => {
    await setGitCredential(server, root, { type: "https", username: "somebody", token: "private-token" });
    assert.deepEqual(await listGitCredentials(server, root), { configured: true, type: "https", username: "somebody" });
    const file = path.join(tmp, "secrets", fs.readdirSync(path.join(tmp, "secrets"))[0]);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    await deleteGitCredential(server, root);
    assert.deepEqual(await listGitCredentials(server, root), { configured: false });
});

test("root credentials can be configured before the first project", async () => {
    const empty = path.join(tmp, "empty-projects");
    fs.mkdirSync(empty);
    git(tmp, "init", empty);
    assert.equal(await gitRootForProject({ ...server, projectsDir: empty } as DockgeekServer, ""), empty);
    const plain = path.join(tmp, "no-repository");
    fs.mkdirSync(plain);
    await assert.rejects(gitRootForProject({ ...server, projectsDir: plain } as DockgeekServer, ""));
});

test("creates a new Git-backed project and pushes only allowed files", async () => {
    const draft = { name: "new-project", isAdd: true, filename: "compose.yaml", composeYAML: "services:\n  web:\n    image: alpine\n", composeENV: "SECRET=local\n", draftFiles: { "settings.yaml": "setting: one\n" }, deploy: false };
    const preview = await previewGitProject(server, draft);
    const result = await applyGitProject(server, { ...draft, previewId: preview.previewId }, async () => {});
    assert.equal(result.projectName, "new-project");
    assert.equal(fs.existsSync(path.join(root, "new-project", ".env")), true);
    assert.equal(git(root, "ls-tree", "-r", "--name-only", "HEAD", "new-project"), "new-project/compose.yaml\nnew-project/settings.yaml");
    assert.equal(git(root, "diff", "--cached", "--name-only"), "");
});

test("non-Git projects return notGit instead of a blocking error", async () => {
    const bare = path.join(tmp, "plain");
    const plainDir = path.join(bare, "ordinary");
    fs.mkdirSync(plainDir, { recursive: true });
    fs.writeFileSync(path.join(plainDir, "compose.yaml"), "services:\n  web:\n    image: alpine\n");
    const plainServer = { ...server, projectsDir: bare } as DockgeekServer;
    const request = { ...payload(), name: "ordinary", modifiedFiles: {} };
    const preview = await previewGitProject(plainServer, request);
    assert.deepEqual(preview, { ok: false, notGit: true, code: "NOT_GIT_REPOSITORY" });
    const newProject = await previewGitProject(plainServer, { ...request, name: "new-plain", isAdd: true });
    assert.deepEqual(newProject, { ok: false, notGit: true, code: "NOT_GIT_REPOSITORY" });
});

test("preview rejects invalid file paths and stale content", async () => {
    await assert.rejects(previewGitProject(server, { ...payload(), modifiedFiles: { "../evil.yaml": "x" } }));
    const preview = await previewGitProject(server, payload());
    fs.writeFileSync(path.join(projectDir, "settings.yaml"), "changed: elsewhere\n");
    await assert.rejects(applyGitProject(server, { ...payload(), previewId: preview.previewId }, async () => {}), /stale/);
    fs.writeFileSync(path.join(projectDir, "settings.yaml"), "value: old\n");
});

test("a per-project repository is recognized without a repository at projects root", async () => {
    const separateBase = path.join(tmp, "isolated-projects");
    const separate = path.join(separateBase, "own-repo");
    fs.mkdirSync(separate, { recursive: true });
    git(tmp, "init", separate);
    git(separate, "config", "user.email", "test@example.com");
    git(separate, "config", "user.name", "Test");
    fs.writeFileSync(path.join(separate, "compose.yaml"), "services:\n  web:\n    image: alpine\n");
    git(separate, "add", ".");
    git(separate, "commit", "-m", "Initial");
    git(separate, "remote", "add", "origin", `ssh://localhost${remotePath()}`);
    git(separate, "fetch", "origin", "main");
    git(separate, "branch", "--set-upstream-to", "origin/main");
    const isolatedServer = { ...server, projectsDir: separateBase } as DockgeekServer;
    const request = { ...payload(), name: "own-repo", composeENV: "", modifiedFiles: {} };
    const preview = await previewGitProject(isolatedServer, request);
    assert.equal(preview.repository, separate);
    assert.deepEqual(preview.changes!.map(change => change.type), [ "modify" ]);
});

test("a linked Git worktree is treated as a repository", async () => {
    const worktrees = path.join(tmp, "worktrees");
    fs.mkdirSync(worktrees);
    const linked = path.join(worktrees, "linked");
    git(root, "worktree", "add", "-b", "linked", linked);
    git(linked, "branch", "--set-upstream-to", "origin/main");
    const worktreeServer = { ...server, projectsDir: linked } as DockgeekServer;
    const request = { ...payload(), composeYAML: "services:\n  web:\n    image: alpine:edge\n", composeENV: "", modifiedFiles: {} };
    const preview = await previewGitProject(worktreeServer, request);
    assert.equal(preview.repository, linked);
    assert.equal(await gitRootForProject(worktreeServer, "sample"), linked);
});

test("preview reports create, modify and delete diffs while preserving the index", async () => {
    const indexed = git(root, "ls-files", "--stage");
    const withChanges = { ...payload(), modifiedFiles: { "settings.yaml": "value: changed\n", "created.yaml": "new: file\n" }, deletedFiles: [ "unrelated.yaml" ] };
    // A newly created editable file is represented by the frontend as modifiedFiles.
    fs.writeFileSync(path.join(projectDir, "created.yaml"), "new: file\n");
    const preview = await previewGitProject(server, withChanges);
    assert.deepEqual(preview.changes!.map(change => [ change.type, change.path ]), [[ "modify", "sample/compose.yaml" ], [ "create", "sample/created.yaml" ], [ "modify", "sample/settings.yaml" ], [ "delete", "sample/unrelated.yaml" ]]);
    assert.ok(preview.changes!.every(change => change.diff.includes("diff --git")));
    assert.equal(git(root, "ls-files", "--stage"), indexed);
    fs.unlinkSync(path.join(projectDir, "created.yaml"));
});

test("ignored-only changes save and deploy without committing or pushing", async () => {
    const head = git(root, "rev-parse", "HEAD");
    const onlyIgnored = { ...payload(), composeYAML: fs.readFileSync(path.join(projectDir, "compose.yaml"), "utf8"), modifiedFiles: {}, composeENV: "TOKEN=only-local\n", deploy: true };
    const preview = await previewGitProject(server, onlyIgnored);
    assert.deepEqual(preview.changes, []);
    assert.deepEqual(preview.ignored, [ "sample/.env" ]);
    let deployed = 0;
    const result = await applyGitProject(server, { ...onlyIgnored, previewId: preview.previewId }, async () => {
        deployed++;
    });
    assert.equal(deployed, 1);
    assert.equal(result.commit, null);
    assert.equal(git(root, "rev-parse", "HEAD"), head);
    assert.equal(fs.readFileSync(path.join(projectDir, ".env"), "utf8"), onlyIgnored.composeENV);
});

test("missing upstream reports an actionable error without exposing remote details", async () => {
    const separate = path.join(tmp, "no-upstream");
    fs.mkdirSync(path.join(separate, "sample"), { recursive: true });
    git(tmp, "init", separate);
    fs.writeFileSync(path.join(separate, "sample", "compose.yaml"), "services:\n  web:\n    image: alpine\n");
    git(separate, "add", ".");
    git(separate, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");
    const isolatedServer = { ...server, projectsDir: separate } as DockgeekServer;
    await assert.rejects(previewGitProject(isolatedServer, { ...payload(), composeENV: "", modifiedFiles: {} }), /no upstream/);
});

test("remote mismatch fails before push and never deploys", async () => {
    const request = payload();
    const preview = await previewGitProject(server, request);
    const remote = remotePath();
    const originalRemoteHead = git(remote, "rev-parse", "HEAD");
    git(remote, "update-ref", "refs/heads/main", git(root, "rev-parse", "HEAD~1"));
    let deployed = false;
    await assert.rejects(applyGitProject(server, { ...request, previewId: preview.previewId }, async () => {
        deployed = true;
    }), /Remote changed/);
    assert.equal(deployed, false);
    assert.equal(git(root, "rev-parse", "HEAD"), originalRemoteHead);
    git(remote, "update-ref", "refs/heads/main", originalRemoteHead);
    git(root, "reset", "--hard", originalRemoteHead);
    fs.writeFileSync(path.join(projectDir, ".env"), "TOKEN=old\n");
});

test("failed push leaves HEAD retryable and does not deploy", async () => {
    const request = payload();
    const preview = await previewGitProject(server, request);
    const head = git(root, "rev-parse", "HEAD");
    git(root, "remote", "set-url", "--push", "origin", `ssh://localhost${path.join(tmp, "missing.git")}`);
    let deployed = false;
    await assert.rejects(applyGitProject(server, { ...request, previewId: preview.previewId }, async () => {
        deployed = true;
    }), /Git operation failed/);
    assert.equal(git(root, "rev-parse", "HEAD"), head);
    assert.equal(deployed, false);
    git(root, "remote", "set-url", "--push", "origin", `ssh://localhost${remotePath()}`);
    const retry = await previewGitProject(server, request);
    assert.ok(retry.changes?.length);
    const result = await applyGitProject(server, { ...request, previewId: retry.previewId }, async () => {});
    assert.equal(git(remotePath(), "rev-parse", "HEAD"), result.commit);
    git(root, "reset", "--hard", head);
    git(remotePath(), "update-ref", "refs/heads/main", head);
    fs.writeFileSync(path.join(projectDir, ".env"), "TOKEN=old\n");
});

test("commits only selected paths without altering unrelated staged files; ignored files stay local", async () => {
    fs.writeFileSync(path.join(projectDir, "unrelated.yaml"), "unrelated: staged\n");
    git(root, "add", "sample/unrelated.yaml");
    const indexBefore = git(root, "ls-files", "--stage", "sample/unrelated.yaml");
    const preview = await previewGitProject(server, payload());
    assert.deepEqual(preview.changes!.map(change => [ change.type, change.path ]), [[ "modify", "sample/compose.yaml" ], [ "modify", "sample/settings.yaml" ]]);
    assert.match(preview.changes![0].diff, /alpine:latest/);
    assert.deepEqual(preview.ignored, [ "sample/.env" ]);
    let deployed = false;
    const result = await applyGitProject(server, { ...payload(), previewId: preview.previewId }, async () => {
        deployed = true;
    });
    assert.equal(deployed, false);
    assert.equal(result.projectName, "sample");
    assert.equal(git(root, "ls-files", "--stage", "sample/unrelated.yaml"), indexBefore);
    assert.equal(git(root, "diff", "--cached", "--name-only"), "sample/unrelated.yaml");
    assert.equal(git(root, "status", "--porcelain", "--", "sample/compose.yaml", "sample/settings.yaml"), "");
    assert.equal(git(root, "show", "--format=", "--name-only", "HEAD"), "sample/compose.yaml\nsample/settings.yaml");
    assert.equal(fs.readFileSync(path.join(projectDir, ".env"), "utf8"), "TOKEN=changed\n");
    assert.equal(git(root, "show", "HEAD:sample/settings.yaml"), "value: changed");
    assert.equal(git(remotePath(), "rev-parse", "HEAD"), result.commit);
});
function remotePath() {
    return path.join(tmp, "remote.git");
}
