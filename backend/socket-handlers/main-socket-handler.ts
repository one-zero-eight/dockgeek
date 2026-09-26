import { SocketHandler } from "../socket-handler.js";
import { DockgeServer } from "../dockge-server";
import { R } from "redbean-node";
import { DEFAULT_COMPOSE_FILE_PATTERNS, DEFAULT_EDITABLE_FILE_PATTERNS, filePatterns } from "../../common/util-common";
import { checkAdmin, checkLogin, DockgeSocket } from "../util-server";
import { Settings } from "../settings";
import { randomBytes } from "node:crypto";
import { secretHash } from "../auth";
import fs, { promises as fsAsync } from "fs";
import path from "path";

export class MainSocketHandler extends SocketHandler {
    create(socket : DockgeSocket, server : DockgeServer) {
        socket.on("createAgentKey", async (label, endpoint, callback) => {
            try {
                checkAdmin(socket);
                if (typeof label !== "string" || typeof endpoint !== "string" || !label.trim() || !endpoint.trim()) {
                    throw new Error("Invalid agent key request");
                }
                const key = randomBytes(32).toString("base64url");
                await R.knex("dockge_agent_key").insert({ hash: secretHash(key), label, endpoint, revoked: false });
                callback({ ok: true, key });
            } catch (e) {
                callback({ ok: false, msg: e instanceof Error ? e.message : "Invalid key" });
            }
        });

        socket.on("listAgentKeys", async (callback) => {
            try {
                checkAdmin(socket);
                callback({ ok: true, keys: await R.knex("dockge_agent_key").select("hash", "label", "endpoint", "revoked") });
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
                await R.knex("dockge_agent_key").where("hash", hash).update({ revoked: true });
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
                data.composeFilePatterns = (await Settings.get("composeFilePatterns")) || "";
                data.editableFilePatterns = (await Settings.get("editableFilePatterns")) || "";
                data.globalENV = fs.existsSync(path.join(server.stacksDir, "global.env"))
                    ? fs.readFileSync(path.join(server.stacksDir, "global.env"), "utf-8")
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
                if (data.globalENV && data.globalENV !== "# VARIABLE=value #comment") {
                    await fsAsync.writeFile(path.join(server.stacksDir, "global.env"), data.globalENV);
                } else {
                    await fsAsync.rm(path.join(server.stacksDir, "global.env"), { force: true });
                }
                delete data.globalENV;
                for (const key of [ "composeFilePatterns", "editableFilePatterns" ]) {
                    if (typeof data[key] !== "string" || (data[key].trim() && filePatterns(data[key]).some(pattern => /[/\\\0]/.test(pattern)))) {
                        throw new Error(`Invalid ${key}: use comma-separated filename patterns without paths`);
                    }
                    data[key] = data[key].trim();
                }
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
