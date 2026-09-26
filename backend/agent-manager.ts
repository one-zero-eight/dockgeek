import { DockgeSocket } from "./util-server";
import { io, Socket as SocketClient } from "socket.io-client";
import { log } from "./log";
import { Agent } from "./models/agent";
import { isDev, LooseObject, sleep } from "../common/util-common";
import semver from "semver";
import { R } from "redbean-node";
import dayjs, { Dayjs } from "dayjs";

export class AgentManager {
    protected socket : DockgeSocket;
    protected agentSocketList : Record<string, SocketClient> = {};
    protected agentLoggedInList : Record<string, boolean> = {};
    protected _firstConnectTime : Dayjs = dayjs();

    constructor(socket: DockgeSocket) {
        this.socket = socket;
    }

    get firstConnectTime() : Dayjs {
        return this._firstConnectTime;
    }

    test(url : string, key : string) : Promise<void> {
        return new Promise((resolve, reject) => {
            const endpoint = new URL(url).host;
            const client = io(url, { reconnection: false, auth: { endpoint, agentKey: key } });
            client.on("connect", () => {
                resolve();
                client.disconnect();
            });
            client.on("connect_error", (err) => {
                reject(err);
                client.disconnect();
            });
        });
    }

    async add(url: string, key: string, name: string): Promise<Agent> {
        const bean = R.dispense("agent") as Agent;
        bean.url = url;
        bean.username = "agent-key";
        bean.password = key;
        bean.name = name;
        await R.store(bean);
        return bean;
    }

    async remove(url : string) {
        const bean = await R.findOne("agent", " url = ? ", [ url ]);
        if (!bean) {
            throw new Error("Agent not found");
        }
        const endpoint = bean.endpoint;
        await R.trash(bean);
        this.disconnect(endpoint);
        this.sendAgentList();
        delete this.agentSocketList[endpoint];
    }

    async update(url: string, updatedName: string) {
        const agent = await R.findOne("agent", " url = ? ", [ url ]);
        if (!agent) {
            throw new Error("Agent not found");
        }
        agent.name = updatedName;
        await R.store(agent);
    }

    connect(url : string, key : string) {
        const endpoint = new URL(url).host;
        this.socket.emit("agentStatus", { endpoint, status: "connecting" });
        if (this.agentSocketList[endpoint]) {
            return;
        }
        const client = io(url, { auth: { endpoint, agentKey: key } });
        client.on("connect", () => {
            this.agentLoggedInList[endpoint] = true;
            this.socket.emit("agentStatus", { endpoint, status: "online" });
        });
        client.on("connect_error", (err) => {
            log.error("agent-manager", `Unable to authenticate agent ${endpoint}: ${err.message}`);
            this.agentLoggedInList[endpoint] = false;
            this.socket.emit("agentStatus", { endpoint, status: "offline" });
        });
        client.on("disconnect", () => {
            this.agentLoggedInList[endpoint] = false;
            this.socket.emit("agentStatus", { endpoint, status: "offline" });
        });
        client.on("agent", (...args : unknown[]) => this.socket.emit("agent", ...args));
        client.on("info", (res) => {
            if (!isDev && res.version && semver.satisfies(res.version, "< 1.4.0")) {
                this.socket.emit("agentStatus", { endpoint, status: "offline", msg: `Unsupported version: ${res.version}` });
                client.disconnect();
            }
        });
        this.agentSocketList[endpoint] = client;
    }

    disconnect(endpoint : string) {
        this.agentSocketList[endpoint]?.disconnect();
    }

    async connectAll() {
        this._firstConnectTime = dayjs();
        if (this.socket.endpoint) {
            return;
        }
        const list = await Agent.getAgentList();
        for (const endpoint in list) {
            const agent = list[endpoint];
            if (agent.username === "agent-key") {
                this.connect(agent.url, agent.password);
            }
        }
    }

    disconnectAll() {
        for (const endpoint in this.agentSocketList) {
            this.disconnect(endpoint);
        }
    }

    async emitToEndpoint(endpoint: string, eventName: string, ...args : unknown[]) {
        const client = this.agentSocketList[endpoint];
        if (!client) {
            throw new Error("Socket client not found for endpoint: " + endpoint);
        }
        if (!client.connected || !this.agentLoggedInList[endpoint]) {
            let diff = dayjs().diff(this.firstConnectTime, "second");
            while (diff < 10 && (!client.connected || !this.agentLoggedInList[endpoint])) {
                await sleep(1000);
                diff = dayjs().diff(this.firstConnectTime, "second");
            }
            if (!client.connected || !this.agentLoggedInList[endpoint]) {
                throw new Error("Socket client not connected for endpoint: " + endpoint);
            }
        }
        client.emit("agent", endpoint, eventName, ...args);
    }

    emitToAllEndpoints(eventName: string, ...args : unknown[]) {
        for (const endpoint in this.agentSocketList) {
            this.emitToEndpoint(endpoint, eventName, ...args).catch((e) => log.warn("agent-manager", e.message));
        }
    }

    async sendAgentList() {
        const list = await Agent.getAgentList();
        const result : Record<string, LooseObject> = { "": { url: "", username: "", endpoint: "", name: "", updatedName: "" } };
        for (const endpoint in list) {
            result[endpoint] = list[endpoint].toJSON();
        }
        this.socket.emit("agentList", { ok: true, agentList: result });
    }
}
