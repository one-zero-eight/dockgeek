import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import semver from "semver";

const root = fileURLToPath(new URL("../", import.meta.url));
const version = process.env.VERSION;

function run(command: string, args: string[]): string {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
    if (result.error || result.status !== 0) {
        const reason = result.error?.message || result.stderr.trim() || result.stdout.trim() || `exit status ${result.status}`;
        throw new Error(`${command} ${args.join(" ")} failed: ${reason}`);
    }
    return result.stdout.trim();
}

function readVersion(file: string): string {
    return JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).version;
}

try {
    if (!version || semver.valid(version) !== version || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error("VERSION must be an exact semver version (e.g. 2.0.0 or 2.0.0-beta.1)");
    }

    const releaseType = process.env.npm_lifecycle_event;
    if (releaseType === "release-final" && semver.prerelease(version)) {
        throw new Error("release-final requires a stable VERSION");
    }
    if (releaseType === "release-beta" && !semver.prerelease(version)) {
        throw new Error("release-beta requires a prerelease VERSION");
    }

    // Refuse even untracked files: the image build uses the entire working directory.
    if (run("git", [ "status", "--porcelain=v1", "--untracked-files=all" ])) {
        throw new Error("Working tree is dirty; commit or remove unrelated changes before releasing");
    }
    if (run("git", [ "branch", "--show-current" ]) !== "master") {
        throw new Error("Releases must be made from master");
    }
    const currentVersion = readVersion("package.json");
    if (semver.lt(version, currentVersion)) {
        throw new Error(`VERSION must not be older than the current version (${currentVersion})`);
    }
    if (readVersion("package-lock.json") !== currentVersion) {
        throw new Error("package.json and package-lock.json versions do not match");
    }
    if (run("git", [ "tag", "-l", version ]) === version) {
        throw new Error(`Tag ${version} already exists locally`);
    }
    if (run("git", [ "ls-remote", "--tags", "origin", `refs/tags/${version}` ])) {
        throw new Error(`Tag ${version} already exists on origin`);
    }
    const remoteHead = run("git", [ "ls-remote", "--heads", "origin", "master" ]).split(/\s/)[0];
    if (!remoteHead || remoteHead !== run("git", [ "rev-parse", "HEAD" ])) {
        throw new Error("origin/master must exist and match HEAD before releasing");
    }

    if (version !== currentVersion) {
        // npm version updates the manifest and both root version fields in the lockfile.
        run("npm", [ "version", version, "--no-git-tag-version", "--ignore-scripts" ]);
        if (readVersion("package.json") !== version || readVersion("package-lock.json") !== version) {
            throw new Error("npm did not update both package versions");
        }
        run("git", [ "add", "--", "package.json", "package-lock.json" ]);
        run("git", [ "commit", "-m", `Update to ${version}`, "--", "package.json", "package-lock.json" ]);
    }
    // An already-versioned HEAD needs only a tag, not an empty version commit.
    run("git", [ "tag", "-a", version, "-m", `Release ${version}` ]);
    if (run("git", [ "status", "--porcelain=v1", "--untracked-files=all" ])) {
        throw new Error("Working tree changed during release; commit and tag were not pushed");
    }
    // Publish commit and tag together. A failure prevents the subsequent image push.
    run("git", [ "push", "--atomic", "origin", "HEAD:refs/heads/master", `refs/tags/${version}` ]);
    console.log(`Pushed release ${version} to origin/master`);
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
