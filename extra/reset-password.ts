import { Database } from "../backend/database";
import { R } from "redbean-node";
import { DockgeServer } from "../backend/dockge-server";
import { randomBytes, createHash } from "node:crypto";

// Recovery must be performed offline; startup will issue a fresh, one-time claim URL.
if (!process.env.TEST_BACKEND) {
    const server = new DockgeServer();
    await Database.init(server);
    if (!await R.knex.schema.hasTable("dockge_admin") || !await R.knex.schema.hasTable("dockge_bootstrap")) {
        throw new Error("Dockge admin tables are not initialized; start Dockge before running recovery");
    }
    await R.knex("dockge_admin").delete();
    const token = randomBytes(32).toString("base64url");
    await R.knex("dockge_bootstrap").delete();
    await R.knex("dockge_bootstrap").insert({ id: 1, hash: createHash("sha256").update(token).digest("hex"), expires: Date.now() + 15 * 60 * 1000 });
    await Database.close();
    console.log(`Admin claim reset. Stop Dockge if it is running, then visit ${(process.env.BETTER_AUTH_URL || "http://localhost:5001").replace(/\/$/, "")}/setup?claim=${token} within 15 minutes. Existing sessions cannot access Dockge until a new admin claims it.`);
}
