import { log } from "./log";
import { R } from "redbean-node";
import type { DockgeekServer } from "./dockge-server";
import fs from "node:fs";
import path from "node:path";
import knex from "knex";

export class Database {
    static sqlitePath: string;
    static knexMigrationsPath = "./backend/migrations";

    /** Connect to SQLite and apply the current application schema. */
    static async init(server: DockgeekServer) {
        fs.mkdirSync(server.config.dataDir, { recursive: true });
        this.sqlitePath = path.join(server.config.dataDir, "dockgeek.db");
        log.debug("db", "Connecting to the database");
        await this.connect();
        await this.patch();
        log.info("db", "Connected to the database");
    }

    /** Open the application database and load its models. */
    static async connect(autoloadModels = true) {
        const knexInstance = knex({
            client: "better-sqlite3",
            connection: { filename: this.sqlitePath },
            useNullAsDefault: true,
            acquireConnectionTimeout: 120 * 1000,
            pool: { min: 1, max: 1 },
        });

        // @ts-ignore
        R.setup(knexInstance);
        if (process.env.SQL_LOG === "1") {
            R.debug(true);
        }
        R.freeze(true);
        if (autoloadModels) {
            R.autoloadModels("./backend/models", "ts");
        }
        await this.initSQLite();
    }

    /** Configure SQLite durability and foreign key enforcement. */
    static async initSQLite() {
        await R.exec("PRAGMA foreign_keys = ON");
        await R.exec("PRAGMA journal_mode = WAL");
        await R.exec("PRAGMA cache_size = -12000");
        await R.exec("PRAGMA auto_vacuum = INCREMENTAL");
        await R.exec("PRAGMA synchronous = NORMAL");
        log.debug("db", "SQLite Version: " + await R.getCell("SELECT sqlite_version()"));
    }

    /** Apply migrations; incompatible migration histories must fail startup. */
    static async patch() {
        await R.knex.migrate.latest({
            directory: this.knexMigrationsPath,
            loadExtensions: [ ".ts" ],
        });
    }

    /** Flush the write-ahead log and close the database. */
    static async close() {
        log.info("db", "Closing the database");
        await R.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        await R.close();
        log.info("db", "Database closed");
    }

    /** Return the SQLite database file size in bytes. */
    static getSize() {
        return fs.statSync(this.sqlitePath).size;
    }

    /** Reclaim unused SQLite storage. */
    static async shrink() {
        await R.exec("VACUUM");
    }
}
