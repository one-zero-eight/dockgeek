import * as childProcessAsync from "promisify-child-process";
import { log } from "./log";

const WIKI_URL = "https://github.com/one-zero-eight/dockgeek/wiki/Rootless-Docker";

/**
 * Detect whether the Docker daemon Dockgeek talks to is rootless.
 * Uses `docker info` Security Options (`name=rootless`).
 */
export async function isDockerRootless() : Promise<boolean | null> {
    try {
        const res = await childProcessAsync.spawn(
            "docker",
            [ "info", "--format", "{{json .SecurityOptions}}" ],
            { encoding: "utf-8" },
        );
        const stdout = String(res.stdout ?? "").trim();
        if (!stdout) {
            return null;
        }
        const options = JSON.parse(stdout) as unknown;
        if (!Array.isArray(options)) {
            return null;
        }
        return options.some((item) => typeof item === "string" && /(^|,)name=rootless(,|$)/.test(item));
    } catch {
        return null;
    }
}

/**
 * Log whether Dockgeek is connected to rootless Docker (recommended) or rootful.
 */
export async function logDockerRootlessStatus() : Promise<void> {
    const rootless = await isDockerRootless();
    if (rootless === true) {
        log.info("docker", "Connected to rootless Docker (recommended).");
        return;
    }
    if (rootless === false) {
        log.warn(
            "docker",
            `Connected to rootful Docker. Socket access is root-equivalent on the host. ` +
            `Prefer rootless Docker with a dedicated user so Dockgeek cannot gain host root. ` +
            `See ${WIKI_URL}`,
        );
        return;
    }
    log.warn(
        "docker",
        `Could not determine whether Docker is rootless (is the daemon reachable?). ` +
        `Recommended: rootless Docker with a dedicated user. See ${WIKI_URL}`,
    );
}
