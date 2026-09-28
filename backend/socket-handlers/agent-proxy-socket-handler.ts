import { SocketHandler } from "../socket-handler.js";
import { DockgeekServer } from "../dockge-server";
import { log } from "../log";
import { callbackError, checkAdmin, checkLogin, DockgeekSocket } from "../util-server";
import { isGitOpsEvent } from "../auth";
import { AgentSocket } from "../../common/agent-socket";
import { ALL_ENDPOINTS } from "../../common/util-common";

export class AgentProxySocketHandler extends SocketHandler {

    create2(socket : DockgeekSocket, server : DockgeekServer, agentSocket : AgentSocket) {
        // Agent - proxying requests if needed
        socket.on("agent", async (endpoint : unknown, eventName : unknown, ...args : unknown[]) => {
            try {
                checkLogin(socket);

                // Check Type
                if (typeof(endpoint) !== "string") {
                    throw new Error("Endpoint must be a string: " + endpoint);
                }
                if (typeof(eventName) !== "string") {
                    throw new Error("Event name must be a string");
                }

                if (isGitOpsEvent(eventName)) {
                    checkAdmin(socket);
                    if (endpoint === ALL_ENDPOINTS) {
                        throw new Error("GitOps requires a specific endpoint");
                    }
                    if (args.length !== 2 || typeof args[1] !== "function") {
                        throw new Error("Invalid GitOps request");
                    }
                }

                if (endpoint === ALL_ENDPOINTS) {      // Send to all endpoints
                    log.debug("agent", "Sending to all endpoints: " + eventName);
                    socket.instanceManager.emitToAllEndpoints(eventName, ...args);

                } else if (!endpoint || endpoint === socket.endpoint) {      // Direct connection or matching endpoint
                    log.debug("agent", "Matched endpoint: " + eventName);
                    agentSocket.call(eventName, ...args);

                } else {
                    log.debug("agent", "Proxying request to " + endpoint + " for " + eventName);
                    await socket.instanceManager.emitToEndpoint(endpoint, eventName, ...args);
                }
            } catch (e) {
                if (typeof eventName === "string" && isGitOpsEvent(eventName) && typeof args[args.length - 1] === "function") {
                    callbackError(e, args[args.length - 1]);
                } else if (e instanceof Error) {
                    log.warn("agent", e.message);
                }
            }
        });
    }

    create(socket : DockgeekSocket, server : DockgeekServer) {
        throw new Error("Method not implemented. Please use create2 instead.");
    }
}
