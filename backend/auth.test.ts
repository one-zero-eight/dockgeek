import { test, after } from "node:test";
import { betterAuth } from "better-auth";
import { MainSocketHandler } from "./socket-handlers/main-socket-handler";
import { genericOAuth } from "better-auth/plugins";
import { getMigrations } from "better-auth/db/migration";
import { createServer } from "node:http";
import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import knex from "knex";
import sqlite from "@louislam/sqlite3";
// @ts-ignore
import Dialect from "knex/lib/dialects/sqlite3/index.js";
// @ts-ignore
Dialect.prototype._driver = () => sqlite;
import { R } from "redbean-node";
import { appDatabase, claimAdmin, ensureAuthSecret, ensureClaim, ensureSuperadminTable, isAdmin, isSuperAdmin, listAuthUsers, migrateAuthTables, parseLoginProviders, secretHash, signGitOpsDelegation, verifyAgentKey, verifyGitOpsDelegation } from "./auth";
import { Database as DockgeekDatabase } from "./database";
import { checkAdmin, checkGitOpsAdmin, checkLogin, DockgeekSocket } from "./util-server";
import { AgentManager } from "./agent-manager";
import { AgentProxySocketHandler } from "./socket-handlers/agent-proxy-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import { DockgeekServer } from "./dockge-server";

const dir = mkdtempSync(path.join(tmpdir(), "dockgeek-auth-test-"));
const db = knex({ client: Dialect, connection: { filename: path.join(dir, "test.db") }, useNullAsDefault: true });
R.setup(db);

after(async () => {
    await db.destroy();
    rmSync(dir, { recursive: true, force: true });
});

try {
    await db.schema.createTable("dockgeek_admin", table => table.string("user_id").primary());
    await db.schema.createTable("dockgeek_superadmin", table => table.string("user_id").primary());
    await db.schema.createTable("dockgeek_bootstrap", table => {
        table.integer("id").primary();
        table.string("hash");
        table.bigInteger("expires");
    });
    await db.schema.createTable("dockgeek_agent_key", table => {
        table.string("hash").primary();
        table.string("endpoint");
        table.boolean("revoked");
    });

    test("legacy auth tables migrate with admin, claim, and agent data intact", async () => {
        const names = [ "admin", "bootstrap", "agent_key" ];
        for (const name of names) {
            await db.schema.renameTable(`dockgeek_${name}`, `dockge_${name}`);
        }
        await db("dockge_admin").insert({ user_id: "migrated-user" });
        await db("dockge_bootstrap").insert({ id: 1, hash: secretHash("existing-claim"), expires: Date.now() + 60_000 });
        await db("dockge_agent_key").insert({ hash: secretHash("existing-key"), endpoint: "legacy.test:5001", revoked: false });
        await migrateAuthTables(db);
        await migrateAuthTables(db); // Repeated startups must be safe.
        assert.equal(await isAdmin("migrated-user"), true);
        assert.equal(await verifyAgentKey("existing-key", "legacy.test:5001"), true);
        assert.equal((await db("dockgeek_bootstrap").first()).hash, secretHash("existing-claim"));
        assert.equal(await db.schema.hasTable("dockge_admin"), false);
        await db("dockgeek_admin").delete();
        await db("dockgeek_bootstrap").delete();
        await db("dockgeek_agent_key").delete();
    });

    test("mixed auth tables fail closed without losing legacy rows", async () => {
        for (const name of [ "admin", "bootstrap", "agent_key" ]) {
            await db.schema.createTable(`dockge_${name}`, table => table.string("user_id"));
        }
        await db("dockge_admin").insert({ user_id: "preserved-user" });
        await assert.rejects(migrateAuthTables(db), /Both dockge_admin and dockgeek_admin exist/);
        assert.equal((await db("dockge_admin").first()).user_id, "preserved-user");
        for (const name of [ "admin", "bootstrap", "agent_key" ]) {
            await db.schema.dropTable(`dockge_${name}`);
        }
    });

    test("single-admin upgrades assign superadmin without guessing among multiple admins", async () => {
        await db.schema.dropTable("dockgeek_superadmin");
        await db("dockgeek_admin").insert({ user_id: "original-owner" });
        await ensureSuperadminTable(db);
        await ensureSuperadminTable(db);
        assert.equal(await isSuperAdmin("original-owner"), true);
        await db.schema.dropTable("dockgeek_superadmin");
        await db("dockgeek_admin").insert({ user_id: "second-admin" });
        await ensureSuperadminTable(db);
        assert.equal(await isSuperAdmin("original-owner"), false);
        assert.equal(await isSuperAdmin("second-admin"), false);
        await db("dockgeek_admin").delete();
        await db("dockgeek_superadmin").delete();
    });

    test("generated Better Auth secret persists and never overrides an explicit value", () => {
        const dataDir = path.join(dir, "auth-secret-test");
        const suppliedDir = path.join(dir, "supplied-secret-test");
        assert.equal(ensureAuthSecret(suppliedDir, { BETTER_AUTH_SECRET: "provided-first" }), "provided-first");
        assert.equal(existsSync(suppliedDir), false);
        const env : NodeJS.ProcessEnv = {};
        const generated = ensureAuthSecret(dataDir, env);
        const file = path.join(dataDir, "better-auth-secret");
        assert.ok(existsSync(file));
        assert.equal(existsSync(path.join(dataDir, "secrets")), false);
        assert.equal(readFileSync(file, "utf8").trim(), generated);
        assert.equal(statSync(file).mode & 0o777, 0o600);
        assert.equal(ensureAuthSecret(dataDir, {}), generated);
        assert.equal(ensureAuthSecret(dataDir, { BETTER_AUTH_SECRET: "user-supplied" }), "user-supplied");
        assert.equal(readFileSync(file, "utf8").trim(), generated);
    });

    test("rejects insecure or empty persisted Better Auth secrets", () => {
        const dataDir = path.join(dir, "auth-secret-test");
        const file = path.join(dataDir, "better-auth-secret");
        chmodSync(file, 0o644);
        assert.throws(() => ensureAuthSecret(dataDir, {}), /Insecure Better Auth secret file/);
        chmodSync(file, 0o600);
        writeFileSync(file, "");
        assert.throws(() => ensureAuthSecret(dataDir, {}), /Empty Better Auth secret file/);
        assert.throws(() => ensureAuthSecret(dataDir, { BETTER_AUTH_SECRET: "" }), /must not be empty/);
    });

    test("login buttons require configured providers and valid public labels", () => {
        const options = { plugins: [ genericOAuth({ config: [{ providerId: "pocket-id", clientId: "test", clientSecret: "test", discoveryUrl: "http://localhost:1/.well-known/openid-configuration" }] }) ] };
        assert.deepEqual(parseLoginProviders(undefined, options), []);
        assert.throws(() => parseLoginProviders(undefined, { ...options, emailAndPassword: { enabled: false } }), /dockgeekLoginProviders/);
        assert.throws(() => parseLoginProviders([], { ...options, emailAndPassword: { enabled: false } }), /At least one login provider/);
        assert.deepEqual(parseLoginProviders([{ id: "pocket-id", label: " Pocket ID " }], options), [{ id: "pocket-id", label: "Pocket ID" }]);
        assert.deepEqual(parseLoginProviders([{ id: "pocket-id", label: "Pocket ID" }], { ...options, emailAndPassword: { enabled: false } }), [{ id: "pocket-id", label: "Pocket ID" }]);
        assert.throws(() => parseLoginProviders([{ id: "unknown", label: "Unknown" }], options), /No Generic OAuth provider/);
        assert.throws(() => parseLoginProviders([{ id: "pocket-id", label: "X" }, { id: "pocket-id", label: "Y" }], options), /duplicate/);
        assert.throws(() => parseLoginProviders([{ id: "bad/id", label: "Unsafe" }], options), /Invalid/);
    });

    test("OIDC discovery completes sign-in without granting Dockgeek admin", async () => {
        const discovery = createServer((request, response) => {
            const base = `http://127.0.0.1:${(discovery.address() as { port: number }).port}`;
            response.setHeader("Content-Type", "application/json");
            if (request.url?.startsWith("/.well-known/openid-configuration")) {
                response.end(JSON.stringify({
                    issuer: base,
                    authorization_endpoint: `${base}/authorize`,
                    token_endpoint: `${base}/token`,
                    userinfo_endpoint: `${base}/userinfo`,
                    response_types_supported: [ "code" ],
                    subject_types_supported: [ "public" ],
                    id_token_signing_alg_values_supported: [ "RS256" ],
                }));
            } else if (request.url?.startsWith("/token")) {
                response.end(JSON.stringify({ access_token: "mock-access-token", token_type: "Bearer", expires_in: 3600 }));
            } else if (request.url?.startsWith("/userinfo")) {
                response.end(JSON.stringify({ sub: "example-oidc-user", id: "example-oidc-user", email: "oidc@example.test", email_verified: true, name: "Example User" }));
            } else {
                response.statusCode = 404;
                response.end();
            }
        });
        await new Promise<void>(resolve => discovery.listen(0, "127.0.0.1", resolve));
        const discoveryURL = `http://127.0.0.1:${(discovery.address() as { port: number }).port}/.well-known/openid-configuration`;
        try {
            const authDb = new Database(":memory:");
            try {
                const oidc = betterAuth({
                    database: authDb,
                    secret: "a-test-secret-at-least-thirty-two-bytes-long",
                    baseURL: "http://localhost:5001",
                    emailAndPassword: { enabled: true },
                    plugins: [ genericOAuth({ config: [{
                        providerId: "example-oidc",
                        clientId: "dockgeek-test-client",
                        clientSecret: "test-client-secret",
                        scopes: [ "openid", "profile", "email" ],
                        discoveryUrl: discoveryURL,
                    }] }) ],
                });
                await (await getMigrations(oidc.options)).runMigrations();
                const response = await oidc.api.signInSocial({ body: { provider: "example-oidc", callbackURL: "/" }, asResponse: true });
                assert.equal(response.status, 200);
                const { url } = await response.json() as { url: string };
                const destination = new URL(url);
                assert.equal(destination.origin, new URL(discoveryURL).origin);
                assert.equal(destination.searchParams.get("client_id"), "dockgeek-test-client");
                assert.equal(destination.searchParams.get("redirect_uri"), "http://localhost:5001/api/auth/callback/example-oidc");
                assert.ok(destination.searchParams.get("state"));
                assert.ok(destination.searchParams.get("code_challenge"));
                assert.equal(destination.searchParams.get("scope"), "openid profile email");
                const cookies = response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
                const callback = await oidc.handler(new Request(`http://localhost:5001/api/auth/callback/example-oidc?code=mock-code&state=${destination.searchParams.get("state")}`, { headers: { cookie: cookies } }));
                assert.equal(callback.status, 302);
                const sessionCookies = callback.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
                const session = await oidc.api.getSession({ headers: new Headers({ cookie: `${cookies}; ${sessionCookies}` }) });
                assert.equal(session?.user.email, "oidc@example.test");
                assert.equal(await isAdmin(session!.user.id), false);
            } finally {
                authDb.close();
            }
        } finally {
            await new Promise<void>((resolve, reject) => discovery.close(error => error ? reject(error) : resolve()));
        }
    });

    test("only the claimed superadmin can promote existing accounts", async () => {
        DockgeekDatabase.sqlitePath = path.join(dir, "promotions", "dockgeek.db");
        const authDb = appDatabase();
        authDb.exec("CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL)");
        authDb.prepare("INSERT INTO user (id, email, name) VALUES (?, ?, ?)").run("oidc-user", "oidc@example.test", "OIDC User");
        const handlers = new Map<string, (...args: unknown[]) => void>();
        const socket = {
            principal: { kind: "agent", endpoint: "remote", keyHash: "key" },
            on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler),
        } as unknown as DockgeekSocket;
        new MainSocketHandler().create(socket, {} as DockgeekServer);
        const call = (event: string, ...args: unknown[]) => new Promise<{ ok: boolean; msg?: string; users?: { id: string; admin: boolean }[] }>(resolve => {
            handlers.get(event)!(...args, resolve);
        });
        assert.equal((await call("listAuthUsers")).ok, false);
        assert.equal((await call("promoteAdmin", "oidc-user")).ok, false);
        assert.equal(await isAdmin("oidc-user"), false);
        socket.principal = { kind: "admin", userId: "ordinary-admin" };
        assert.equal((await call("listAuthUsers")).ok, false);
        assert.match((await call("promoteAdmin", "oidc-user")).msg!, /Superadmin/);
        await db("dockgeek_admin").insert({ user_id: "claimed-owner" });
        await db("dockgeek_superadmin").insert({ user_id: "claimed-owner" });
        socket.principal = { kind: "admin", userId: "claimed-owner" };
        assert.equal((await call("promoteAdmin", "nonexistent")).ok, false);
        assert.equal((await call("promoteAdmin", "")).ok, false);
        assert.equal((await call("promoteAdmin", "oidc-user")).ok, true);
        assert.equal((await call("promoteAdmin", "oidc-user")).ok, true);
        assert.equal(await isAdmin("oidc-user"), true);
        assert.equal(await isSuperAdmin("oidc-user"), false);
        assert.deepEqual(await listAuthUsers(), [{ id: "oidc-user", email: "oidc@example.test", name: "OIDC User", admin: true, superadmin: false }]);
        assert.equal((await call("listAuthUsers")).users?.[0].admin, true);
        socket.principal = { kind: "admin", userId: "oidc-user" };
        assert.equal((await call("promoteAdmin", "claimed-owner")).ok, false);
        await db("dockgeek_superadmin").delete();
        await db("dockgeek_admin").delete();
    });

    test("socket principals distinguish administrators from agents", () => {
        const socket = {} as DockgeekSocket;
        assert.throws(() => checkLogin(socket));
        assert.throws(() => checkAdmin(socket));
        socket.principal = { kind: "agent", keyHash: secretHash("key"), endpoint: "server.test:5001" };
        assert.doesNotThrow(() => checkLogin(socket));
        assert.throws(() => checkAdmin(socket));
        socket.principal = { kind: "admin", userId: "better-auth-user-id" };
        assert.doesNotThrow(() => checkAdmin(socket));
    });

    test("remote GitOps requires an event- and payload-bound single-use signed grant", () => {
        const previousSecret = process.env.DOCKGEEK_GITOPS_PROXY_SECRET;
        process.env.DOCKGEEK_GITOPS_PROXY_SECRET = "a-separate-shared-gitops-secret-32-bytes-long";
        try {
            const socket = { principal: { kind: "agent", keyHash: "agent-key", endpoint: "remote.test:5001" } } as DockgeekSocket;
            const payload = { name: "sample" };
            const grant = signGitOpsDelegation("listGitCredentials", payload, "remote.test:5001");
            assert.throws(() => checkGitOpsAdmin(socket, "listGitCredentials", payload), /Administrator access required/);
            assert.throws(() => checkGitOpsAdmin(socket, "listGitCredentials", { name: "other" }, grant), /Administrator access required/);
            assert.throws(() => checkGitOpsAdmin(socket, "deleteGitCredential", payload, grant), /Administrator access required/);
            assert.equal(verifyGitOpsDelegation(grant, "other.test:5001", "listGitCredentials", payload), false);
            checkGitOpsAdmin(socket, "listGitCredentials", payload, grant);
            assert.throws(() => checkGitOpsAdmin(socket, "listGitCredentials", payload, grant), /Administrator access required/);
            const forged = { ...signGitOpsDelegation("listGitCredentials", payload, "remote.test:5001"), payload: { name: "other" } };
            assert.throws(() => checkGitOpsAdmin(socket, "listGitCredentials", forged.payload, forged), /Administrator access required/);
            const expired = { ...signGitOpsDelegation("listGitCredentials", payload, "remote.test:5001"), timestamp: Date.now() - 60_000 };
            assert.throws(() => checkGitOpsAdmin(socket, "listGitCredentials", payload, expired), /Administrator access required/);
            const direct = { principal: { kind: "admin", userId: "admin" } } as DockgeekSocket;
            assert.doesNotThrow(() => checkGitOpsAdmin(direct, "listGitCredentials", payload));
        } finally {
            if (previousSecret === undefined) {
                delete process.env.DOCKGEEK_GITOPS_PROXY_SECRET;
            } else {
                process.env.DOCKGEEK_GITOPS_PROXY_SECRET = previousSecret;
            }
        }
    });

    test("proxy blocks agent-key GitOps and returns a rejection to callers", async () => {
        const handlers = new Map<string, (...args: unknown[]) => void>();
        const socket = {
            principal: { kind: "agent", keyHash: "key", endpoint: "remote.test:5001" },
            endpoint: "remote.test:5001",
            on: (event: string, handler: (...args: unknown[]) => void) => {
                handlers.set(event, handler);
            },
        } as unknown as DockgeekSocket;
        new AgentProxySocketHandler().create2(socket, {} as DockgeekServer, new AgentSocket());
        const response = await new Promise<{ ok: boolean; msg: string }>(resolve => {
            handlers.get("agent")!(socket.endpoint, "listGitCredentials", { name: "sample" }, resolve);
        });
        assert.equal(response.ok, false);
        assert.match(response.msg, /Administrator access required/);
    });

    test("agent manager attaches signed grants only for administrator GitOps requests", async () => {
        const previousSecret = process.env.DOCKGEEK_GITOPS_PROXY_SECRET;
        process.env.DOCKGEEK_GITOPS_PROXY_SECRET = "a-separate-shared-gitops-secret-32-bytes-long";
        try {
            let emitted: unknown[] = [];
            const client = { connected: true, emit: (...args: unknown[]) => {
                emitted = args;
            } };
            const socket = { principal: { kind: "admin", userId: "admin" } } as DockgeekSocket;
            const manager = new AgentManager(socket) as unknown as {
                agentSocketList: Record<string, typeof client>;
                agentLoggedInList: Record<string, boolean>;
                emitToEndpoint: AgentManager["emitToEndpoint"];
            };
            manager.agentSocketList["remote.test:5001"] = client;
            manager.agentLoggedInList["remote.test:5001"] = true;
            const payload = { name: "sample" };
            await manager.emitToEndpoint("remote.test:5001", "listGitCredentials", payload, () => {});
            assert.equal(emitted[0], "agent");
            assert.equal(emitted[2], "listGitCredentials");
            assert.equal(verifyGitOpsDelegation(emitted[4], "remote.test:5001", "listGitCredentials", payload), true);
            socket.principal = { kind: "agent", keyHash: "key", endpoint: "remote.test:5001" };
            await assert.rejects(manager.emitToEndpoint("remote.test:5001", "listGitCredentials", payload, () => {}), /Administrator access required/);
        } finally {
            if (previousSecret === undefined) {
                delete process.env.DOCKGEEK_GITOPS_PROXY_SECRET;
            } else {
                process.env.DOCKGEEK_GITOPS_PROXY_SECRET = previousSecret;
            }
        }
    });

    test("first admin claim is single use and fails closed", async () => {
        const token = "a-valid-test-claim";
        await db("dockgeek_bootstrap").insert({ id: 1, hash: secretHash(token), expires: Date.now() + 10000 });
        assert.equal(await claimAdmin("user1", "wrong"), false);
        assert.equal(await claimAdmin("user1", token), true);
        assert.equal(await isAdmin("user1"), true);
        assert.equal(await isSuperAdmin("user1"), true);
        assert.equal(await claimAdmin("user2", token), false);
        await db("dockgeek_superadmin").delete();
    });

    test("expired claims are rejected", async () => {
        await db("dockgeek_admin").delete();
        await db("dockgeek_bootstrap").insert({ id: 1, hash: secretHash("expired"), expires: Date.now() - 1000 });
        assert.equal(await claimAdmin("user2", "expired"), false);
        await db("dockgeek_bootstrap").delete();
    });

    test("agent credentials bind an endpoint and can be revoked", async () => {
        await db("dockgeek_agent_key").insert({ hash: secretHash("secret"), endpoint: "server.test:5001", revoked: false });
        assert.equal(await verifyAgentKey("secret", "server.test:5001"), true);
        assert.equal(await verifyAgentKey("secret", "other.test:5001"), false);
        assert.equal(await verifyAgentKey("invalid", "server.test:5001"), false);
        await db("dockgeek_agent_key").where("hash", secretHash("secret")).update({ revoked: true });
        assert.equal(await verifyAgentKey("secret", "server.test:5001"), false);
    });

    test("claim generation preserves an unexpired recovery token", async () => {
        const hash = secretHash("recovery-token");
        await db("dockgeek_bootstrap").insert({ id: 1, hash, expires: Date.now() + 60_000 });
        await ensureClaim();
        assert.equal((await db("dockgeek_bootstrap").first()).hash, hash);
        await db("dockgeek_bootstrap").delete();
    });

    test("claim generation only occurs without an admin", async () => {
        await db("dockgeek_admin").insert({ user_id: "user1" });
        await ensureClaim();
        assert.equal(await db("dockgeek_bootstrap").first(), undefined);
    });
} catch (error) {
    await db.destroy();
    rmSync(dir, { recursive: true, force: true });
    throw error;
}
