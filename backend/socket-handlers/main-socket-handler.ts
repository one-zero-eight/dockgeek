import { SocketHandler } from "../socket-handler.js";
import { DockgeekServer } from "../dockge-server";
import { R } from "redbean-node";
import { DEFAULT_COMPOSE_FILE_PATTERNS, DEFAULT_EDITABLE_FILE_PATTERNS, filePatterns } from "../../common/util-common";
import { checkAdmin, checkLogin, DockgeekSocket } from "../util-server";
import { Settings } from "../settings";
import { randomBytes } from "node:crypto";
import { isSuperAdmin, listAuthUsers, promoteAdmin, secretHash } from "../auth";
import fs, { promises as fsAsync } from "fs";
import path from "path";
import { parseEditorSchemaAllowedPrefixes } from "../editor-schema";

export class MainSocketHandler extends SocketHandler {
    create(socket : DockgeekSocket, server : DockgeekServer) {
        socket.on("listAuthUsers", async (callback) => {
            try {
                checkAdmin(socket);
                if (!await isSuperAdmin(socket.principal.userId)) {
                    throw new Error("Superadmin access required.");
                }
                callback({ ok: true, users: await listAuthUsers() });
            } catch (error) {
                callback({ ok: false, msg: error instanceof Error ? error.message : "Unable to list users" });
            }
        });

        socket.on("promoteAdmin", async (userId, callback) => {
            try {
                checkAdmin(socket);
                if (!await isSuperAdmin(socket.principal.userId)) {
                    throw new Error("Superadmin access required.");
                }
                await promoteAdmin(userId);
                callback({ ok: true });
            } catch (error) {
                callback({ ok: false, msg: error instanceof Error ? error.message : "Unable to promote user" });
            }
        });

        socket.on("createAgentKey", async (label, endpoint, callback) => {
            try {
                checkAdmin(socket);
                if (typeof label !== "string" || typeof endpoint !== "string" || !label.trim() || !endpoint.trim()) {
                    throw new Error("Invalid agent key request");
                }
                const key = randomBytes(32).toString("base64url");
                await R.knex("dockgeek_agent_key").insert({ hash: secretHash(key), label, endpoint, revoked: false });
                callback({ ok: true, key });
            } catch (e) {
                callback({ ok: false, msg: e instanceof Error ? e.message : "Invalid key" });
            }
        });

        socket.on("listAgentKeys", async (callback) => {
            try {
                checkAdmin(socket);
                callback({ ok: true, keys: await R.knex("dockgeek_agent_key").select("hash", "label", "endpoint", "revoked") });
            } catch (e) {
                callback({ ok: false, msg: e instanceof Error ? e.message : "Unauthorized" });
            }
        });

        socket.on("revokeAgentKey", async (hash, callback) => {
            try {
                checkAdmin(socket);
                if (typeof hash !== "string") {
                    throw new Error("Unauthorized");
                }
                await R.knex("dockgeek_agent_key").where("hash", hash).update({ revoked: true });
                callback({ ok: true });
            } catch (e) {
                callback({ ok: false, msg: e instanceof Error ? e.message : "Unauthorized" });
            }
        });

        socket.on("getSettings", async (callback) => {
            try {
                checkLogin(socket);
                const data = await Settings.getSettings("general");
                delete data.disableAuth;
                delete data.schemaUrlPatterns;
                data.composeFilePatterns = (await Settings.get("composeFilePatterns")) || "";
                data.editableFilePatterns = (await Settings.get("editableFilePatterns")) || "";
                data.editorSchemaAllowedPrefixes = (await Settings.get("editorSchemaAllowedPrefixes")) || "";
                data.globalENV = fs.existsSync(path.join(server.projectsDir, "global.env"))
                    ? fs.readFileSync(path.join(server.projectsDir, "global.env"), "utf-8")
                    : "# VARIABLE=value #comment";
                callback({ ok: true, data });
            } catch (e) {
                callback({ ok: false, msg: e instanceof Error ? e.message : "Unable to read settings" });
            }
        });

        socket.on("setSettings", async (data, _currentPassword, callback) => {
            try {
                checkAdmin(socket);
                if (!data || typeof data !== "object") {
                    throw new Error("Unauthorized");
                }
                delete data.disableAuth;
                delete data.schemaUrlPatterns;
                data.editorSchemaAllowedPrefixes ??= (await Settings.get("editorSchemaAllowedPrefixes")) || "";
                parseEditorSchemaAllowedPrefixes(data.editorSchemaAllowedPrefixes);
                if (data.globalENV && data.globalENV !== "# VARIABLE=value #comment") {
                    await fsAsync.writeFile(path.join(server.projectsDir, "global.env"), data.globalENV);
                } else {
                    await fsAsync.rm(path.join(server.projectsDir, "global.env"), { force: true });
                }
                delete data.globalENV;
                for (const key of [ "composeFilePatterns", "editableFilePatterns" ]) {
                    if (typeof data[key] !== "string" || (data[key].trim() && filePatterns(data[key]).some(pattern => /[/\\\0]/.test(pattern)))) {
                        throw new Error(`Invalid ${key}: use comma-separated filename patterns without paths`);
                    }
                    data[key] = data[key].trim();
                }
                data.editorSchemaAllowedPrefixes = data.editorSchemaAllowedPrefixes.trim();
                await Settings.setSettings("general", data);
                server.composeFilePatterns = data.composeFilePatterns || DEFAULT_COMPOSE_FILE_PATTERNS;
                server.editableFilePatterns = data.editableFilePatterns || DEFAULT_EDITABLE_FILE_PATTERNS;
                callback({ ok: true, msg: "Saved" });
                server.sendInfo(socket);
            } catch (e) {
                callback({ ok: false, msg: e instanceof Error ? e.message : "Unable to save settings" });
            }
        });

        socket.on("disconnectOtherSocketClients", () => {
            checkAdmin(socket);
            server.disconnectAllSocketClients(socket.principal, socket.id);
        });
    }
}
