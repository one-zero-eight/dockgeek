import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import Database from "better-sqlite3";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { closeSync, constants, fstatSync, linkSync, mkdirSync, openSync, readSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { R } from "redbean-node";
import { Database as DockgeekDatabase } from "./database";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import { log } from "./log";
import type { Knex } from "knex";

let database: Database.Database;
export function appDatabase() : Database.Database {
    if (!database) {
        const authDataDir = path.dirname(DockgeekDatabase.sqlitePath || path.resolve(process.env.DOCKGEEK_DATA_DIR || "/app/dockgeek-data", "dockgeek.db"));
        mkdirSync(authDataDir, { recursive: true });
        database = new Database(path.join(authDataDir, "auth.db"));
        database.pragma("journal_mode = WAL");
    }
    return database;
}

export type Auth = ReturnType<typeof betterAuth>;
let auth: Auth;

export type LoginProvider = { id: string; label: string };
let loginProviders: LoginProvider[] = [];

export function getLoginOptions() {
    return { emailPassword: getAuth().options.emailAndPassword?.enabled === true, providers: loginProviders };
}

export function parseLoginProviders(value: unknown, options: Pick<Auth["options"], "plugins" | "emailAndPassword">): LoginProvider[] {
    if (value === undefined) {
        if (options.emailAndPassword?.enabled === false) {
            throw new Error("Configure dockgeekLoginProviders before disabling password sign-in");
        }
        return [];
    }
    if (!Array.isArray(value)) {
        throw new Error("dockgeekLoginProviders must be an array");
    }
    if (!value.length && options.emailAndPassword?.enabled === false) {
        throw new Error("At least one login provider is required when password sign-in is disabled");
    }
    const ids = new Set<string>();
    return value.map((entry: unknown) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new Error("Invalid dockgeekLoginProviders entry");
        }
        const { id, label } = entry as Record<string, unknown>;
        if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
            typeof label !== "string" || !label.trim() || label.length > 80 || ids.has(id)) {
            throw new Error("Invalid or duplicate dockgeekLoginProviders entry");
        }
        ids.add(id);
        if (!options.plugins?.some(plugin => plugin.id === "generic-oauth" &&
            (plugin as typeof plugin & { options?: { config?: { providerId: string }[] } }).options?.config?.some(provider => provider.providerId === id))) {
            throw new Error(`No Generic OAuth provider configured for login button: ${id}`);
        }
        return { id, label: label.trim() };
    });
}

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

const AUTH_TABLES = [ "admin", "bootstrap", "agent_key" ];

/** Rename legacy auth tables atomically; refuse ambiguous mixed schemas. */
export async function migrateAuthTables(db : Knex = R.knex) {
    await db.transaction(async trx => {
        for (const suffix of AUTH_TABLES) {
            const legacy = `dockge_${suffix}`;
            const current = `dockgeek_${suffix}`;
            const [ hasLegacy, hasCurrent ] = await Promise.all([
                trx.schema.hasTable(legacy), trx.schema.hasTable(current)
            ]);
            if (hasLegacy && hasCurrent) {
                throw new Error(`Both ${legacy} and ${current} exist; resolve conflicting auth tables manually`);
            }
            if (hasLegacy) {
                await trx.schema.renameTable(legacy, current);
            }
        }
    });
}

export async function ensureSuperadminTable(db : Knex = R.knex) {
    await db.transaction(async trx => {
        if (await trx.schema.hasTable("dockgeek_superadmin")) {
            return;
        }
        await trx.schema.createTable("dockgeek_superadmin", (table : Knex.CreateTableBuilder) => {
            table.string("user_id").primary();
        });
        // Existing single-admin installs have an unambiguous owner. Never guess among multiple admins.
        const admins = await trx("dockgeek_admin").select("user_id").limit(2);
        if (admins.length === 1) {
            await trx("dockgeek_superadmin").insert({ user_id: admins[0].user_id });
        }
    });
}

export async function initAuth(baseURL? : string) {
    ensureAuthSecret(path.dirname(DockgeekDatabase.sqlitePath));
    const configPath = path.resolve(process.env.BETTER_AUTH_CONFIG || "./backend/default-auth.ts");
    const module = await import(pathToFileURL(configPath).href);
    if (!module.default?.api?.getSession || !module.default?.handler) {
        throw new Error(`Invalid Better Auth configuration: ${configPath} must default-export a Better Auth instance`);
    }
    auth = module.default;
    loginProviders = parseLoginProviders(module.dockgeekLoginProviders, auth.options);
    if (!auth.options.database) {
        throw new Error("Better Auth config must provide a persistent database");
    }
    if (auth.options.database !== appDatabase()) {
        throw new Error("Custom Better Auth config must use appDatabase() so sessions and schema remain under Dockgeek's data directory");
    }
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    await migrateAuthTables();
    if (!await R.knex.schema.hasTable("dockgeek_admin")) {
        await R.knex.schema.createTable("dockgeek_admin", (table : Knex.CreateTableBuilder) => {
            table.string("user_id").primary();
        });
    }
    await ensureSuperadminTable();
    if (!await R.knex.schema.hasTable("dockgeek_bootstrap")) {
        await R.knex.schema.createTable("dockgeek_bootstrap", (table : Knex.CreateTableBuilder) => {
            table.integer("id").primary();
            table.string("hash").notNullable();
            table.bigInteger("expires").notNullable();
        });
    }
    if (!await R.knex.schema.hasTable("dockgeek_agent_key")) {
        await R.knex.schema.createTable("dockgeek_agent_key", (table : Knex.CreateTableBuilder) => {
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
    return !!(await R.knex("dockgeek_admin").where("user_id", userId).first());
}

export async function isSuperAdmin(userId : string) : Promise<boolean> {
    return !!(await R.knex("dockgeek_superadmin").where("user_id", userId).first());
}

export async function listAuthUsers() {
    const users = appDatabase().prepare("SELECT id, email, name FROM user ORDER BY email").all() as { id: string; email: string; name: string }[];
    const admins = new Set((await R.knex("dockgeek_admin").select("user_id")).map((row : { user_id: string }) => row.user_id));
    const superadmins = new Set((await R.knex("dockgeek_superadmin").select("user_id")).map((row : { user_id: string }) => row.user_id));
    return users.map(user => ({ ...user, admin: admins.has(user.id), superadmin: superadmins.has(user.id) }));
}

export async function promoteAdmin(userId : unknown) {
    if (typeof userId !== "string" || !userId || userId.length > 256) {
        throw new Error("Invalid user ID");
    }
    const user = appDatabase().prepare("SELECT id FROM user WHERE id = ?").get(userId);
    if (!user) {
        throw new Error("User not found");
    }
    await R.knex("dockgeek_admin").insert({ user_id: userId }).onConflict("user_id").ignore();
}

export function secretHash(secret : string) {
    return createHash("sha256").update(secret).digest("hex");
}

export async function ensureClaim(baseURL = process.env.BETTER_AUTH_URL || "http://localhost:5001") {
    if (await R.knex("dockgeek_admin").first()) {
        return;
    }
    const existing = await R.knex("dockgeek_bootstrap").where("id", 1).first();
    if (existing && existing.expires > Date.now()) {
        return;
    }
    const token = randomBytes(32).toString("base64url");
    await R.knex("dockgeek_bootstrap").delete();
    await R.knex("dockgeek_bootstrap").insert({ id: 1, hash: secretHash(token), expires: Date.now() + 15 * 60 * 1000 });
    log.info("auth", `First admin claim URL (expires in 15 minutes): ${(process.env.BETTER_AUTH_URL || baseURL).replace(/\/$/, "")}/setup?claim=${token}`);
}

export async function claimAdmin(userId : string, token : string) {
    if (typeof token !== "string" || token.length > 128) {
        return false;
    }
    return await R.knex.transaction(async (trx : Knex.Transaction) => {
        if (await trx("dockgeek_admin").first()) {
            return false;
        }
        const claim = await trx("dockgeek_bootstrap").where("id", 1).first();
        const hash = Buffer.from(secretHash(token), "hex");
        if (!claim || claim.expires < Date.now() || !timingSafeEqual(hash, Buffer.from(claim.hash, "hex"))) {
            return false;
        }
        await trx("dockgeek_admin").insert({ user_id: userId });
        await trx("dockgeek_superadmin").insert({ user_id: userId });
        await trx("dockgeek_bootstrap").delete();
        return true;
    });
}

export async function verifyAgentKey(key : string, endpoint : string) {
    if (!key || !endpoint) {
        return false;
    }
    return !!(await R.knex("dockgeek_agent_key").where({ hash: secretHash(key), endpoint, revoked: false }).first());
}

const GITOPS_EVENTS = new Set([ "previewGitProject", "applyGitProject", "listGitCredentials", "setGitCredential", "deleteGitCredential" ]);
export const isGitOpsEvent = (event : string) => GITOPS_EVENTS.has(event);

export interface GitOpsDelegation {
    event: string;
    payload: unknown;
    endpoint: string;
    timestamp: number;
    nonce: string;
    signature: string;
}

function delegationSecret() : string {
    const secret = process.env.DOCKGEEK_GITOPS_PROXY_SECRET;
    // A separate shared secret, not the agent key or the Better Auth secret.
    if (!secret || Buffer.byteLength(secret) < 32) {
        throw new Error("GitOps proxy requires DOCKGEEK_GITOPS_PROXY_SECRET (at least 32 bytes) on both servers");
    }
    return secret;
}

export function signGitOpsDelegation(event : string, payload : unknown, endpoint : string) : GitOpsDelegation {
    if (!isGitOpsEvent(event)) {
        throw new Error("Invalid GitOps event");
    }
    const request = { event, payload, endpoint, timestamp: Date.now(), nonce: randomBytes(24).toString("hex") };
    return { ...request, signature: createHmac("sha256", delegationSecret()).update(JSON.stringify(request)).digest("hex") };
}

const usedDelegations = new Map<string, number>();
export function verifyGitOpsDelegation(request : unknown, endpoint : string, eventName : string, requestPayload : unknown) : request is GitOpsDelegation {
    if (!request || typeof request !== "object") {
        return false;
    }
    const { event, payload, timestamp, nonce, signature } = request as GitOpsDelegation;
    if (event !== eventName || !isGitOpsEvent(event) || JSON.stringify(payload) !== JSON.stringify(requestPayload) ||
        typeof timestamp !== "number" ||
        !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 30_000 ||
        typeof nonce !== "string" || !/^[a-f0-9]{48}$/.test(nonce) ||
        typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature) ||
        (request as GitOpsDelegation).endpoint !== endpoint) {
        return false;
    }
    const expected = createHmac("sha256", delegationSecret()).update(JSON.stringify({ event, payload, endpoint, timestamp, nonce })).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) {
        return false;
    }
    for (const [ key, expiry ] of usedDelegations) {
        if (expiry < Date.now()) {
            usedDelegations.delete(key);
        }
    }
    const replayKey = `${endpoint}:${nonce}`;
    if (usedDelegations.has(replayKey)) {
        return false;
    }
    usedDelegations.set(replayKey, timestamp + 30_000);
    return true;
}
