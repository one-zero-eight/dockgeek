import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import Database from "better-sqlite3";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { closeSync, constants, fstatSync, linkSync, mkdirSync, openSync, readSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { R } from "redbean-node";
import { Database as DockgeDatabase } from "./database";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import { log } from "./log";
import type { Knex } from "knex";

let database: Database.Database;
export function appDatabase() : Database.Database {
    if (!database) {
        const authDataDir = path.dirname(DockgeDatabase.sqlitePath || path.resolve(process.env.DOCKGE_DATA_DIR || "./data", "dockge.db"));
        mkdirSync(authDataDir, { recursive: true });
        database = new Database(path.join(authDataDir, "auth.db"));
        database.pragma("journal_mode = WAL");
    }
    return database;
}

export type Auth = ReturnType<typeof betterAuth>;
let auth: Auth;

/** Resolve a secret before importing auth.ts, so custom configs can read the environment. */
export function ensureAuthSecret(dataDir : string, env : NodeJS.ProcessEnv = process.env) : string {
    if (env.BETTER_AUTH_SECRET !== undefined) {
        if (!env.BETTER_AUTH_SECRET) {
            throw new Error("BETTER_AUTH_SECRET must not be empty");
        }
        return env.BETTER_AUTH_SECRET;
    }

    mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, "better-auth-secret");

    let fd : number;
    try {
        fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
            throw error;
        }
        const temporary = path.join(dataDir, `.better-auth-secret-${randomBytes(12).toString("hex")}`);
        const generated = randomBytes(48).toString("base64url");
        const created = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        try {
            writeFileSync(created, generated + "\n");
        } finally {
            closeSync(created);
        }
        try {
            try {
                linkSync(temporary, file);
            } catch (linkError) {
                if (!(linkError instanceof Error) || !("code" in linkError) || linkError.code !== "EEXIST") {
                    throw linkError;
                }
            }
            fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        } finally {
            unlinkSync(temporary);
        }
    }

    let secret : string;
    try {
        const fileStat = fstatSync(fd);
        if (!fileStat.isFile() || fileStat.nlink !== 1 || fileStat.uid !== process.getuid?.() ||
            (fileStat.mode & 0o077) !== 0) {
            throw new Error(`Insecure Better Auth secret file: ${file}`);
        }
        const buffer = Buffer.alloc(fileStat.size);
        let position = 0;
        while (position < buffer.length) {
            const count = readSync(fd, buffer, position, buffer.length - position, position);
            if (count === 0) {
                throw new Error(`Failed to read Better Auth secret file: ${file}`);
            }
            position += count;
        }
        secret = buffer.toString("utf8").trim();
        if (!secret) {
            throw new Error(`Empty Better Auth secret file: ${file}`);
        }
    } finally {
        closeSync(fd);
    }

    env.BETTER_AUTH_SECRET ??= secret;
    return env.BETTER_AUTH_SECRET;
}

export function getAuth() : Auth {
    if (!auth) {
        throw new Error("Better Auth has not been initialized");
    }
    return auth;
}

export async function initAuth(baseURL? : string) {
    ensureAuthSecret(path.dirname(DockgeDatabase.sqlitePath));
    const configPath = path.resolve(process.env.BETTER_AUTH_CONFIG || "./backend/default-auth.ts");
    const module = await import(pathToFileURL(configPath).href);
    if (!module.default?.api?.getSession || !module.default?.handler) {
        throw new Error(`Invalid Better Auth configuration: ${configPath} must default-export a Better Auth instance`);
    }
    auth = module.default;
    if (!auth.options.database) {
        throw new Error("Better Auth config must provide a persistent database");
    }
    if (auth.options.database !== appDatabase()) {
        throw new Error("Custom Better Auth config must use appDatabase() so sessions and schema remain under Dockge's data directory");
    }
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    if (!await R.knex.schema.hasTable("dockge_admin")) {
        await R.knex.schema.createTable("dockge_admin", (table : Knex.CreateTableBuilder) => {
            table.string("user_id").primary();
        });
    }
    if (!await R.knex.schema.hasTable("dockge_bootstrap")) {
        await R.knex.schema.createTable("dockge_bootstrap", (table : Knex.CreateTableBuilder) => {
            table.integer("id").primary();
            table.string("hash").notNullable();
            table.bigInteger("expires").notNullable();
        });
    }
    if (!await R.knex.schema.hasTable("dockge_agent_key")) {
        await R.knex.schema.createTable("dockge_agent_key", (table : Knex.CreateTableBuilder) => {
            table.string("hash").primary();
            table.string("label").notNullable();
            table.string("endpoint").notNullable();
            table.boolean("revoked").notNullable().defaultTo(false);
        });
    }
    await ensureClaim(baseURL);
}

export async function sessionUser(headers : IncomingHttpHeaders) : Promise<string | null> {
    const session = await getAuth().api.getSession({ headers: fromNodeHeaders(headers) });
    return session?.user?.id || null;
}

export async function isAdmin(userId : string) : Promise<boolean> {
    return !!(await R.knex("dockge_admin").where("user_id", userId).first());
}

export function secretHash(secret : string) {
    return createHash("sha256").update(secret).digest("hex");
}

export async function ensureClaim(baseURL = process.env.BETTER_AUTH_URL || "http://localhost:5001") {
    if (await R.knex("dockge_admin").first()) {
        return;
    }
    const existing = await R.knex("dockge_bootstrap").where("id", 1).first();
    if (existing && existing.expires > Date.now()) {
        return;
    }
    const token = randomBytes(32).toString("base64url");
    await R.knex("dockge_bootstrap").delete();
    await R.knex("dockge_bootstrap").insert({ id: 1, hash: secretHash(token), expires: Date.now() + 15 * 60 * 1000 });
    log.info("auth", `First admin claim URL (expires in 15 minutes): ${(process.env.BETTER_AUTH_URL || baseURL).replace(/\/$/, "")}/setup?claim=${token}`);
}

export async function claimAdmin(userId : string, token : string) {
    if (typeof token !== "string" || token.length > 128) {
        return false;
    }
    return await R.knex.transaction(async (trx : Knex.Transaction) => {
        if (await trx("dockge_admin").first()) {
            return false;
        }
        const claim = await trx("dockge_bootstrap").where("id", 1).first();
        const hash = Buffer.from(secretHash(token), "hex");
        if (!claim || claim.expires < Date.now() || !timingSafeEqual(hash, Buffer.from(claim.hash, "hex"))) {
            return false;
        }
        await trx("dockge_admin").insert({ user_id: userId });
        await trx("dockge_bootstrap").delete();
        return true;
    });
}

export async function verifyAgentKey(key : string, endpoint : string) {
    if (!key || !endpoint) {
        return false;
    }
    return !!(await R.knex("dockge_agent_key").where({ hash: secretHash(key), endpoint, revoked: false }).first());
}
