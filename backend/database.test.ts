import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { R } from "redbean-node";
import { Database } from "./database";
import type { DockgeekServer } from "./dockge-server";
import { AgentManager } from "./agent-manager";
import { Agent } from "./models/agent";
import type { DockgeekSocket } from "./util-server";
import { appDatabase, getAuth, initAuth } from "./auth";

const tables = [ "setting", "agent", "dockgeek_admin", "dockgeek_superadmin", "dockgeek_bootstrap", "dockgeek_agent_key" ];

test("fresh schema supports settings, agent keys, repeated startup, and rollback", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dockgeek-schema-"));
    let authStarted = false;
    try {
        await Database.init({ config: { dataDir: dir } } as DockgeekServer);
        for (const table of tables) {
            assert.equal(await R.knex.schema.hasTable(table), true);
        }
        assert.equal(await R.knex.schema.hasTable("user"), false);
        const columns = await R.knex("agent").columnInfo();
        assert.ok(columns.key);
        assert.equal(columns.username, undefined);
        assert.equal(columns.password, undefined);

        await R.knex("setting").insert({ key: "language", value: "\"en\"", type: "general" });
        const manager = new AgentManager({} as DockgeekSocket);
        const agent = await manager.add("https://remote.test:5001", "test-agent-key", "Remote");
        assert.equal(agent.key, "test-agent-key");
        const stored = (await Agent.getAgentList())["remote.test:5001"];
        assert.deepEqual(stored.toJSON(), { url: "https://remote.test:5001", endpoint: "remote.test:5001", name: "Remote" });
        assert.equal(JSON.stringify(stored.toJSON()).includes("test-agent-key"), false);

        await Database.close();
        await Database.init({ config: { dataDir: dir } } as DockgeekServer);
        assert.equal((await R.knex("setting").where("key", "language").first()).value, "\"en\"");
        assert.equal((await R.knex("agent").first()).key, "test-agent-key");
        assert.equal((await R.knex("knex_migrations").select()).length, 1);

        await R.knex.migrate.rollback({ directory: Database.knexMigrationsPath, loadExtensions: [ ".ts" ] });
        for (const table of tables) {
            assert.equal(await R.knex.schema.hasTable(table), false);
        }
        await Database.patch();
        assert.equal(await R.knex.schema.hasTable("dockgeek_superadmin"), true);
        assert.equal(await R.knex("agent").first(), undefined);

        authStarted = true;
        await initAuth("http://localhost:5001");
        assert.ok(getAuth().api.getSession);
        assert.ok(appDatabase().prepare("SELECT name FROM sqlite_master WHERE name = 'user'").get());
        assert.equal(await R.knex.schema.hasTable("user"), false);
        const claim = await R.knex("dockgeek_bootstrap").where("id", 1).first();
        assert.ok(claim.hash);
        await initAuth("http://localhost:5001");
        assert.equal((await R.knex("dockgeek_bootstrap").where("id", 1).first()).hash, claim.hash);
    } finally {
        if (authStarted) {
            appDatabase().close();
        }
        await Database.close();
        rmSync(dir, { recursive: true, force: true });
    }
});

test("incompatible migration histories fail instead of silently continuing", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dockgeek-history-"));
    try {
        await Database.init({ config: { dataDir: dir } } as DockgeekServer);
        await R.knex("knex_migrations").insert({ name: "missing-migration.ts", batch: 2, migration_time: new Date() });
        await assert.rejects(Database.patch(), /the following files are missing/);
    } finally {
        await Database.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
