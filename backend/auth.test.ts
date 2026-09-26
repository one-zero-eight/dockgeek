import { test, after } from "node:test";
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
import { claimAdmin, ensureAuthSecret, ensureClaim, isAdmin, secretHash, verifyAgentKey } from "./auth";
import { checkAdmin, checkLogin, DockgeSocket } from "./util-server";

const dir = mkdtempSync(path.join(tmpdir(), "dockge-auth-test-"));
const db = knex({ client: Dialect, connection: { filename: path.join(dir, "test.db") }, useNullAsDefault: true });
R.setup(db);

after(async () => {
    await db.destroy();
    rmSync(dir, { recursive: true, force: true });
});

try {
    await db.schema.createTable("dockge_admin", table => table.string("user_id").primary());
    await db.schema.createTable("dockge_bootstrap", table => {
        table.integer("id").primary();
        table.string("hash");
        table.bigInteger("expires");
    });
    await db.schema.createTable("dockge_agent_key", table => {
        table.string("hash").primary();
        table.string("endpoint");
        table.boolean("revoked");
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

    test("socket principals distinguish administrators from agents", () => {
        const socket = {} as DockgeSocket;
        assert.throws(() => checkLogin(socket));
        assert.throws(() => checkAdmin(socket));
        socket.principal = { kind: "agent", keyHash: secretHash("key"), endpoint: "server.test:5001" };
        assert.doesNotThrow(() => checkLogin(socket));
        assert.throws(() => checkAdmin(socket));
        socket.principal = { kind: "admin", userId: "better-auth-user-id" };
        assert.doesNotThrow(() => checkAdmin(socket));
    });

    test("first admin claim is single use and fails closed", async () => {
        const token = "a-valid-test-claim";
        await db("dockge_bootstrap").insert({ id: 1, hash: secretHash(token), expires: Date.now() + 10000 });
        assert.equal(await claimAdmin("user1", "wrong"), false);
        assert.equal(await claimAdmin("user1", token), true);
        assert.equal(await isAdmin("user1"), true);
        assert.equal(await claimAdmin("user2", token), false);
    });

    test("expired claims are rejected", async () => {
        await db("dockge_admin").delete();
        await db("dockge_bootstrap").insert({ id: 1, hash: secretHash("expired"), expires: Date.now() - 1000 });
        assert.equal(await claimAdmin("user2", "expired"), false);
        await db("dockge_bootstrap").delete();
    });

    test("agent credentials bind an endpoint and can be revoked", async () => {
        await db("dockge_agent_key").insert({ hash: secretHash("secret"), endpoint: "server.test:5001", revoked: false });
        assert.equal(await verifyAgentKey("secret", "server.test:5001"), true);
        assert.equal(await verifyAgentKey("secret", "other.test:5001"), false);
        assert.equal(await verifyAgentKey("invalid", "server.test:5001"), false);
        await db("dockge_agent_key").where("hash", secretHash("secret")).update({ revoked: true });
        assert.equal(await verifyAgentKey("secret", "server.test:5001"), false);
    });

    test("claim generation preserves an unexpired recovery token", async () => {
        const hash = secretHash("recovery-token");
        await db("dockge_bootstrap").insert({ id: 1, hash, expires: Date.now() + 60_000 });
        await ensureClaim();
        assert.equal((await db("dockge_bootstrap").first()).hash, hash);
        await db("dockge_bootstrap").delete();
    });

    test("claim generation only occurs without an admin", async () => {
        await db("dockge_admin").insert({ user_id: "user1" });
        await ensureClaim();
        assert.equal(await db("dockge_bootstrap").first(), undefined);
    });
} catch (error) {
    await db.destroy();
    rmSync(dir, { recursive: true, force: true });
    throw error;
}
