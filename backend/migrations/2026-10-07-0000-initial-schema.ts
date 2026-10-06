import type { Knex } from "knex";

/** Create the initial Dockgeek application schema. Better Auth owns auth.db. */
export async function up(knex: Knex): Promise<void> {
    await knex.schema
        .createTable("setting", table => {
            table.increments("id");
            table.string("key", 200).notNullable().unique();
            table.text("value");
            table.string("type", 20);
        })
        .createTable("agent", table => {
            table.increments("id");
            table.string("url", 255).notNullable().unique();
            table.text("key").notNullable();
            table.string("name", 255);
        })
        .createTable("dockgeek_admin", table => {
            table.string("user_id").primary();
        })
        .createTable("dockgeek_superadmin", table => {
            table.string("user_id").primary();
        })
        .createTable("dockgeek_bootstrap", table => {
            table.integer("id").primary();
            table.string("hash").notNullable();
            table.bigInteger("expires").notNullable();
        })
        .createTable("dockgeek_agent_key", table => {
            table.string("hash").primary();
            table.string("label").notNullable();
            table.string("endpoint").notNullable();
            table.boolean("revoked").notNullable().defaultTo(false);
        });
}

/** Drop the application schema when rolling back the initial migration. */
export async function down(knex: Knex): Promise<void> {
    await knex.schema
        .dropTable("dockgeek_agent_key")
        .dropTable("dockgeek_bootstrap")
        .dropTable("dockgeek_superadmin")
        .dropTable("dockgeek_admin")
        .dropTable("agent")
        .dropTable("setting");
}
