/*
 * Common utilities for backend and frontend
 */
import yaml from "yaml";
import type { DotenvParseOutput } from "dotenv";

// Init dayjs
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import relativeTime from "dayjs/plugin/relativeTime";
// @ts-ignore
import { replaceVariablesSync } from "@inventage/envsubst";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export interface LooseObject {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
}

export interface BaseRes {
    ok: boolean;
    msg?: string;
}

let randomBytes : (numBytes: number) => Uint8Array;
initRandomBytes();

async function initRandomBytes() {
    if (typeof window !== "undefined" && window.crypto) {
        randomBytes = function randomBytes(numBytes: number) {
            const bytes = new Uint8Array(numBytes);
            for (let i = 0; i < numBytes; i += 65536) {
                window.crypto.getRandomValues(bytes.subarray(i, i + Math.min(numBytes - i, 65536)));
            }
            return bytes;
        };
    } else {
        randomBytes = (await import("node:crypto")).randomBytes;
    }
}

export const ALL_ENDPOINTS = "##ALL_DOCKGE_ENDPOINTS##";

// Stack Status
export const UNKNOWN = 0;
export const CREATED_FILE = 1;
export const CREATED_STACK = 2;
export const RUNNING = 3;
export const EXITED = 4;
export const RESTARTING = 5;
export const PAUSED = 6;
export const REMOVING = 7;
export const DEAD = 8;
/** All containers stopped via SIGKILL/SIGTERM (exit 137/143), or clean exit 0. */
export const STOPPED = 9;

/** Prefer unhealthy states when Compose reports a mixture of container states. */
export function composeStatusToStatus(value : string) : number {
    const states = new Set([ ...value.matchAll(/\b(running|exited|created|restarting|paused|removing|dead)(?:\s*\(\d+\))?/gi) ]
        .map(match => match[1].toLowerCase()));
    if (states.has("dead")) {
        return DEAD;
    }
    if (states.has("removing")) {
        return REMOVING;
    }
    if (states.has("restarting")) {
        return RESTARTING;
    }
    if (states.has("exited")) {
        return EXITED;
    }
    if (states.has("paused")) {
        return PAUSED;
    }
    if (states.has("created")) {
        return CREATED_STACK;
    }
    if (states.has("running")) {
        return RUNNING;
    }
    return UNKNOWN;
}

export function statusName(status : number) : string {
    switch (status) {
        case CREATED_FILE:
            return "draft";
        case CREATED_STACK:
            return "created_stack";
        case RUNNING:
            return "running";
        case EXITED:
            return "exited";
        case STOPPED:
            return "stopped";
        case RESTARTING:
            return "restarting";
        case PAUSED:
            return "paused";
        case REMOVING:
            return "removing";
        case DEAD:
            return "dead";
        default:
            return "unknown";
    }
}

export function statusNameShort(status : number) : string {
    switch (status) {
        case CREATED_FILE:
            return "inactive";
        case CREATED_STACK:
            return "created";
        case RUNNING:
            return "active";
        case EXITED:
            return "exited";
        case STOPPED:
            return "stopped";
        case RESTARTING:
            return "restarting";
        case PAUSED:
            return "paused";
        case REMOVING:
            return "removing";
        case DEAD:
            return "dead";
        default:
            return "?";
    }
}

/**
 * Human-readable container status for service badges (no exit code).
 */
export function formatContainerStatusLabel(container : {
    State?: string;
    Status?: string;
    Health?: string;
} | null | undefined) : string {
    if (!container) {
        return "unknown";
    }

    const state = (container.State || "").toLowerCase();
    if (state === "exited") {
        return "exited";
    }

    if (container.Health) {
        return container.Health.toLowerCase();
    }

    if (container.State) {
        return state;
    }

    return (container.Status || "unknown").toLowerCase();
}

/**
 * Exit-code badge text. Hidden for missing or zero exit codes.
 * @returns {string | null}
 */
export function formatContainerExitLabel(container : {
    State?: string;
    Status?: string;
    ExitCode?: number;
    exitCode?: number;
} | null | undefined) : string | null {
    if (!container) {
        return null;
    }

    let code = container.exitCode ?? container.ExitCode;
    if (typeof code !== "number" || !Number.isFinite(code)) {
        const fromStatus = container.Status?.match(/Exited\s*\((\d+)\)/i);
        if (fromStatus) {
            code = Number.parseInt(fromStatus[1], 10);
        }
    }

    if (typeof code !== "number" || !Number.isFinite(code) || code === 0) {
        return null;
    }

    return `exit ${code}`;
}

/**
 * Docker State.Error text when present (e.g. port bind failure).
 * @returns {string | null}
 */
export function formatContainerError(container : {
    error?: string;
    Error?: string;
} | null | undefined) : string | null {
    const error = container?.error ?? container?.Error;
    if (typeof error !== "string") {
        return null;
    }
    const trimmed = error.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Exit codes that usually mean an external stop/kill (SIGKILL / SIGTERM).
 */
export const EXTERNAL_STOP_EXIT_CODES = new Set([ 137, 143 ]);

/**
 * True when exit code is clean (0) or an external stop (137/143).
 */
export function isCleanOrExternalStopExit(code : unknown) : boolean {
    return typeof code === "number" && Number.isFinite(code) && (code === 0 || EXTERNAL_STOP_EXIT_CODES.has(code));
}

/**
 * Color for the status badge / tree icon. Running is blue; most others gray.
 * Unhealthy is red. State.Error does not recolor the status badge.
 * @returns {"primary" | "danger" | "secondary"}
 */
export function containerStatusTone(container : {
    state?: string;
    health?: string;
} | null | undefined) : "primary" | "danger" | "secondary" {
    if (!container) {
        return "secondary";
    }
    if (container.health === "unhealthy") {
        return "danger";
    }
    if (container.state === "running" || container.health === "healthy") {
        return "primary";
    }
    return "secondary";
}

/**
 * Color for the separate exit-code badge.
 * @returns {"stopped" | "danger" | null}
 */
export function containerExitTone(container : {
    exitCode?: number;
    ExitCode?: number;
    Status?: string;
} | null | undefined) : "stopped" | "danger" | null {
    if (!formatContainerExitLabel(container)) {
        return null;
    }
    const code = container?.exitCode ?? container?.ExitCode;
    if (typeof code === "number" && EXTERNAL_STOP_EXIT_CODES.has(code)) {
        return "stopped";
    }
    return "danger";
}

export function stackStatusTitle(stack : { status?: number; composeStatus?: string } | null | undefined) : string {
    switch (stack?.status ?? UNKNOWN) {
        case CREATED_FILE:
            return "projectStatusInactive";
        case CREATED_STACK:
            return "projectStatusCreated";
        case RUNNING:
            return "projectStatusActive";
        case EXITED:
        case STOPPED:
            return "projectStatusStopped";
        case RESTARTING:
            return "projectStatusRestarting";
        case PAUSED:
            return "projectStatusPaused";
        case REMOVING:
            return "projectStatusRemoving";
        case DEAD:
            return "projectStatusDead";
        default:
            return "projectStatusUnknown";
    }
}

/**
 * Detail line under {@link stackStatusTitle}.
 * Returns either a translation key, or a literal `docker compose ls` status
 * that the UI prefixes with "containers".
 */
export function stackStatusDetail(stack : { status?: number; composeStatus?: string } | null | undefined) : string {
    if (stack?.composeStatus) {
        return stack.composeStatus;
    }
    if (stack?.status === CREATED_FILE) {
        return "projectStatusNotDeployed";
    }
    return statusNameShort(stack?.status ?? UNKNOWN);
}

export function statusColor(status : number) : string {
    switch (status) {
        case CREATED_FILE:
            return "secondary";
        case CREATED_STACK:
        case PAUSED:
        case RESTARTING:
        case REMOVING:
            return "warning";
        case RUNNING:
            return "primary";
        case STOPPED:
            return "stopped";
        case EXITED:
        case DEAD:
            return "danger";
        default:
            return "secondary";
    }
}

export const isDev = process.env.NODE_ENV === "development";
export const TERMINAL_COLS = 105;
export const TERMINAL_ROWS = 10;
export const PROGRESS_TERMINAL_ROWS = 16;

export const COMBINED_TERMINAL_COLS = 58;
export const COMBINED_TERMINAL_ROWS = 20;

export const ERROR_TYPE_VALIDATION = 1;

export const acceptedComposeFileNames = [
    "compose.yaml",
    "docker-compose.yaml",
    "docker-compose.yml",
    "compose.yml",
];

/**
 * Validate a stacks-directory folder basename (not a Compose project name).
 * Rejects empty values, `.` / `..`, and any path separator.
 * @param folderName Folder basename under DOCKGE_STACKS_DIR
 */
export function validateStackFolderName(folderName : string) : void {
    const name = folderName?.trim() ?? "";
    if (!name) {
        throw new Error("Folder name cannot be empty");
    }
    if (name === "." || name === "..") {
        throw new Error("Invalid folder name");
    }
    if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
        throw new Error("Folder name cannot contain path separators");
    }
    // Must be a single path segment
    if (name !== name.split(/[/\\]/).pop()) {
        throw new Error("Folder name must be a single directory name");
    }
}

/**
 * Derive a Docker Compose project name from an arbitrary folder name.
 * Compose requires: [a-z0-9][a-z0-9_-]*
 * @param folderName Folder or display name
 */
export function toComposeProjectName(folderName : string) : string {
    let name = folderName.trim().toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");

    if (!name) {
        name = "stack";
    }
    if (!/^[a-z0-9]/.test(name)) {
        name = "p" + name;
    }
    return name;
}

/**
 * Generate a decimal integer number from a string
 * @param str Input
 * @param length Default is 10 which means 0 - 9
 */
export function intHash(str : string, length = 10) : number {
    // A simple hashing function (you can use more complex hash functions if needed)
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash += str.charCodeAt(i);
    }
    // Normalize the hash to the range [0, 10]
    return (hash % length + length) % length; // Ensure the result is non-negative
}

/**
 * Delays for specified number of seconds
 * @param ms Number of milliseconds to sleep for
 */
export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random alphanumeric string of fixed length
 * @param length Length of string to generate
 * @returns string
 */
export function genSecret(length = 64) {
    let secret = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charsLength = chars.length;
    for ( let i = 0; i < length; i++ ) {
        secret += chars.charAt(getCryptoRandomInt(0, charsLength - 1));
    }
    return secret;
}

/**
 * Get a random integer suitable for use in cryptography between upper
 * and lower bounds.
 * @param min Minimum value of integer
 * @param max Maximum value of integer
 * @returns Cryptographically suitable random integer
 */
export function getCryptoRandomInt(min: number, max: number):number {
    // synchronous version of: https://github.com/joepie91/node-random-number-csprng

    const range = max - min;
    if (range >= Math.pow(2, 32)) {
        console.log("Warning! Range is too large.");
    }

    let tmpRange = range;
    let bitsNeeded = 0;
    let bytesNeeded = 0;
    let mask = 1;

    while (tmpRange > 0) {
        if (bitsNeeded % 8 === 0) {
            bytesNeeded += 1;
        }
        bitsNeeded += 1;
        mask = mask << 1 | 1;
        tmpRange = tmpRange >>> 1;
    }

    const bytes = randomBytes(bytesNeeded);
    let randomValue = 0;

    for (let i = 0; i < bytesNeeded; i++) {
        randomValue |= bytes[i] << 8 * i;
    }

    randomValue = randomValue & mask;

    if (randomValue <= range) {
        return min + randomValue;
    } else {
        return getCryptoRandomInt(min, max);
    }
}

export function getComposeTerminalName(endpoint : string, stack : string) {
    return "compose-" + endpoint + "-" + stack;
}

export function getCombinedTerminalName(endpoint : string, stack : string) {
    return "combined-" + endpoint + "-" + stack;
}

export function getContainerTerminalName(endpoint : string, container : string) {
    return "container-" + endpoint + "-" + container;
}

export function getContainerExecTerminalName(endpoint : string, stackName : string, container : string, index : number, shell : string = "") {
    return "container-exec-" + endpoint + "-" + stackName + "-" + container + "-" + index + (shell ? "-" + shell : "");
}

export function getContainerLogTerminalName(endpoint : string, stackName : string, container : string) {
    return "container-log-" + endpoint + "-" + stackName + "-" + container;
}

export function getContainerInstanceExecTerminalName(endpoint : string, stackName : string, container : string, shell : string) {
    return "container-instance-exec-" + endpoint + "-" + stackName + "-" + container + "-" + shell;
}

/**
 * Possible Inputs:
 * ports:
 *   - "3000"
 *   - "3000-3005"
 *   - "8000:8000"
 *   - "9090-9091:8080-8081"
 *   - "49100:22"
 *   - "8000-9000:80"
 *   - "127.0.0.1:8001:8001"
 *   - "127.0.0.1:5000-5010:5000-5010"
 *   - "0.0.0.0:8080->8080/tcp"
 *   - "6060:6060/udp"
 * @param input
 * @param hostname
 */
export function parseDockerPort(input : string, hostname : string) {
    let port;
    let display;

    const parts = input.split("/");
    let part1 = parts[0];
    let protocol = parts[1] || "tcp";

    // coming from docker ps, split host part
    const arrow = part1.indexOf("->");
    if (arrow >= 0) {
        part1 = part1.split("->")[0];
        const colon = part1.indexOf(":");
        if (colon >= 0) {
            part1 = part1.split(":")[1];
        }
    }

    // Split the last ":"
    const lastColon = part1.lastIndexOf(":");

    if (lastColon === -1) {
        // No colon, so it's just a port or port range
        // Check if it's a port range
        const dash = part1.indexOf("-");
        if (dash === -1) {
            // No dash, so it's just a port
            port = part1;
        } else {
            // Has dash, so it's a port range, use the first port
            port = part1.substring(0, dash);
        }

        display = part1;

    } else {
        // Has colon, so it's a port mapping
        let hostPart = part1.substring(0, lastColon);
        display = hostPart;

        // Check if it's a port range
        const dash = part1.indexOf("-");

        if (dash !== -1) {
            // Has dash, so it's a port range, use the first port
            hostPart = part1.substring(0, dash);
        }

        // Check if it has a ip (ip:port)
        const colon = hostPart.indexOf(":");

        if (colon !== -1) {
            // Has colon, so it's a ip:port
            hostname = hostPart.substring(0, colon);
            port = hostPart.substring(colon + 1);
        } else {
            // No colon, so it's just a port
            port = hostPart;
        }
    }

    let portInt = parseInt(port);

    if (portInt == 443) {
        protocol = "https";
    } else if (protocol === "tcp") {
        protocol = "http";
    }

    return {
        url: protocol + "://" + hostname + ":" + portInt,
        display: display,
    };
}

/**
 * Host-published ports from `docker compose ps` (Publishers / Ports), not compose.yaml.
 * @returns {{ url: string, display: string }[]}
 */
export function containerPublishedPorts(container : {
    ports?: string;
    Ports?: string;
    publishers?: Array<{
        URL?: string;
        PublishedPort?: number;
        Protocol?: string;
    }>;
    Publishers?: Array<{
        URL?: string;
        PublishedPort?: number;
        Protocol?: string;
    }>;
} | null | undefined, hostname : string) : Array<{ url: string; display: string }> {
    if (!container) {
        return [];
    }

    const publishers = container.publishers ?? container.Publishers ?? [];
    if (publishers.length > 0) {
        const seen = new Set<string>();
        const result: Array<{ url: string; display: string }> = [];
        for (const publisher of publishers) {
            const published = publisher.PublishedPort;
            if (typeof published !== "number" || !Number.isFinite(published) || published <= 0) {
                continue;
            }
            // Prefer IPv4 mappings; skip duplicate IPv6 (::) entries for the same port.
            if (publisher.URL === "::") {
                continue;
            }
            const key = `${published}/${publisher.Protocol || "tcp"}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            result.push(parseDockerPort(`${published}/${publisher.Protocol || "tcp"}`, hostname));
        }
        if (result.length > 0) {
            return result;
        }
    }

    const portsText = container.ports ?? container.Ports;
    if (typeof portsText !== "string" || !portsText.trim()) {
        return [];
    }

    const seen = new Set<string>();
    const result: Array<{ url: string; display: string }> = [];
    for (const part of portsText.split(",")) {
        const trimmed = part.trim();
        if (!trimmed || trimmed.includes("[::]")) {
            continue;
        }
        const parsed = parseDockerPort(trimmed, hostname);
        if (seen.has(parsed.display)) {
            continue;
        }
        seen.add(parsed.display);
        result.push(parsed);
    }
    return result;
}

export function envsubst(string : string, variables : LooseObject) : string {
    return replaceVariablesSync(string, variables)[0];
}

/**
 * Traverse all values in the YAML and, for each string value, replace template variables with environment variables.
 * Emulates the behavior of how docker-compose handles environment variables in yaml files.
 * @param content Yaml string
 * @param env Environment variables
 * @returns Parsed config with environment variables replaced
 */
export function envsubstYAML(content : string, env : DotenvParseOutput) : LooseObject {
    return envsubstObject(yaml.parse(content) ?? {}, env) as LooseObject;
}

/**
 * Used for envsubstYAML(...)
 * @param obj
 * @param env
 */
function envsubstObject(obj : unknown, env : DotenvParseOutput) : unknown {
    if (typeof obj === "string") {
        return envsubst(obj, env);
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => envsubstObject(item, env));
    }

    if (obj && typeof obj === "object") {
        const result : LooseObject = {};
        for (const key in obj) {
            result[key] = envsubstObject((obj as LooseObject)[key], env);
        }
        return result;
    }

    return obj;
}
