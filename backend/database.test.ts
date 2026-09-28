import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { Database } from "./database";

test("migrates an existing SQLite database without deleting the old copy", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dockgeek-migrate-"));
    try {
        const legacy = path.join(dir, "dockge.db");
        const original = new BetterSqlite3(legacy);
        original.pragma("journal_mode = WAL");
        original.exec("CREATE TABLE setting (name TEXT PRIMARY KEY, value TEXT)");
        original.prepare("INSERT INTO setting VALUES (?, ?)").run("existing", "preserved");
        original.close();

        await Database.migrateSQLiteFile(dir);
        await Database.migrateSQLiteFile(dir);
        const migrated = new BetterSqlite3(path.join(dir, "dockgeek.db"), { readonly: true });
        assert.equal((migrated.prepare("SELECT value FROM setting WHERE name = ?").get("existing") as { value: string }).value, "preserved");
        migrated.close();
        assert.equal(existsSync(`${legacy}.legacy`), true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("refuses conflicting legacy and new SQLite files", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dockgeek-conflict-"));
    try {
        new BetterSqlite3(path.join(dir, "dockge.db")).close();
        new BetterSqlite3(path.join(dir, "dockgeek.db")).close();
        await assert.rejects(Database.migrateSQLiteFile(dir), /Both legacy and new SQLite databases exist/);
        assert.equal(existsSync(path.join(dir, "dockge.db")), true);
        assert.equal(existsSync(path.join(dir, "dockgeek.db")), true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
