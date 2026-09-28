import { Database } from "../backend/database";
import { R } from "redbean-node";
import { DockgeekServer } from "../backend/dockge-server";
import { randomBytes, createHash } from "node:crypto";

// Recovery must be performed offline; startup will issue a fresh, one-time claim URL.
if (!process.env.TEST_BACKEND) {
    const server = new DockgeekServer();
    await Database.init(server);
    if (!await R.knex.schema.hasTable("dockgeek_admin") || !await R.knex.schema.hasTable("dockgeek_superadmin") || !await R.knex.schema.hasTable("dockgeek_bootstrap")) {
        throw new Error("Dockgeek admin tables are not initialized; start Dockgeek before running recovery");
    }
    await R.knex("dockgeek_superadmin").delete();
    await R.knex("dockgeek_admin").delete();
    const token = randomBytes(32).toString("base64url");
    await R.knex("dockgeek_bootstrap").delete();
    await R.knex("dockgeek_bootstrap").insert({ id: 1, hash: createHash("sha256").update(token).digest("hex"), expires: Date.now() + 15 * 60 * 1000 });
    await Database.close();
    console.log(`Admin claim reset. Stop Dockgeek if it is running, then visit ${(process.env.BETTER_AUTH_URL || "http://localhost:5001").replace(/\/$/, "")}/setup?claim=${token} within 15 minutes. Existing sessions cannot access Dockgeek until a new admin claims it.`);
}
