import { Socket } from "socket.io";
import { Terminal } from "./terminal";
import { log } from "./log";
import { ERROR_TYPE_VALIDATION } from "../common/util-common";
import fs from "fs";
import { AgentManager } from "./agent-manager";

export type SocketPrincipal =
    | { kind: "admin"; userId: string }
    | { kind: "agent"; keyHash: string; endpoint: string };

export interface DockgeSocket extends Socket {
    principal?: SocketPrincipal;
    consoleTerminal? : Terminal;
    instanceManager : AgentManager;
    endpoint : string;
    emitAgent : (eventName : string, ...args : unknown[]) => void;
}

// For command line arguments, so they are nullable
export interface Arguments {
    sslKey? : string;
    sslCert? : string;
    sslKeyPassphrase? : string;
    port? : number;
    hostname? : string;
    dataDir? : string;
    stacksDir? : string;
    enableConsole? : boolean;
    fileManagerRoot? : string;
    fileManagerMaxFileSize? : number;
}

// Some config values are required
export interface Config extends Arguments {
    dataDir : string;
    stacksDir : string;
    fileManagerMaxFileSize : number;
}

export function checkLogin(socket : DockgeSocket) {
    if (!socket.principal) {
        throw new Error("You are not logged in.");
    }
}

export function checkAdmin(socket : DockgeSocket) {
    if (socket.principal?.kind !== "admin") {
        throw new Error("Administrator access required.");
    }
}

export class ValidationError extends Error {
    constructor(message : string) {
        super(message);
    }
}

export function callbackError(error : unknown, callback : unknown) {
    if (typeof(callback) !== "function") {
        log.error("console", "Callback is not a function");
        return;
    }

    if (error instanceof Error) {
        callback({
            ok: false,
            msg: error.message,
            msgi18n: true,
        });
    } else if (error instanceof ValidationError) {
        callback({
            ok: false,
            type: ERROR_TYPE_VALIDATION,
            msg: error.message,
            msgi18n: true,
        });
    } else {
        log.debug("console", "Unknown error: " + error);
    }
}

export function callbackResult(result : unknown, callback : unknown) {
    if (typeof(callback) !== "function") {
        log.error("console", "Callback is not a function");
        return;
    }
    callback(result);
}

export function fileExists(file : string) {
    return fs.promises.access(file, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
}
