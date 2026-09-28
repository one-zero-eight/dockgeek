import { io } from "socket.io-client";
import { Socket } from "socket.io-client";
import { defineComponent } from "vue";
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient();
import { Terminal } from "@xterm/xterm";
import { AgentSocket } from "../../../common/agent-socket";

let socket : Socket;

let terminalMap : Map<string, Terminal> = new Map();

export default defineComponent({
    data() {
        return {
            socketIO: {
                token: null,
                firstConnect: true,
                connected: false,
                connectCount: 0,
                initedSocketIO: false,
                connectionErrorMsg: `${this.$t("Cannot connect to the socket server.")} ${this.$t("Reconnecting...")}`,
                showReverseProxyGuide: true,
                connecting: false,
            },
            info: {

            },
            remember: true,
            loggedIn: false,
            superadmin: false,
            allowLoginDialog: false,
            username: null,

            projectList: {},
            projectsDirectoryPaths: {} as Record<string, string>,

            // All project list from all agents
            allAgentProjectList: {} as Record<string, object>,

            // online / offline / connecting
            agentStatusList: {

            },

            // Agent List
            agentList: {

            },
        };
    },
    computed: {

        agentCount() {
            return Object.keys(this.agentList).length;
        },

        completeProjectList() {
            let list : Record<string, object> = {};

            for (let projectName in this.projectList) {
                list[projectName + "_"] = this.projectList[projectName];
            }

            for (let endpoint in this.allAgentProjectList) {
                let instance = this.allAgentProjectList[endpoint];
                for (let projectName in instance.projectList) {
                    list[projectName + "_" + endpoint] = instance.projectList[projectName];
                }
            }
            return list;
        },

        usernameFirstChar() {
            if (typeof this.username == "string" && this.username.length >= 1) {
                return this.username.charAt(0).toUpperCase();
            } else {
                return "🐬";
            }
        },

        /**
         *  Frontend Version
         *  It should be compiled to a static value while building the frontend.
         *  Please see ./frontend/vite.config.ts, it is defined via vite.js
         * @returns {string}
         */
        frontendVersion() {
            return FRONTEND_VERSION;
        },

        /**
         * Are both frontend and backend in the same version?
         * @returns {boolean}
         */
        isFrontendBackendVersionMatched() {
            if (!this.info.version) {
                return true;
            }
            return this.info.version === this.frontendVersion;
        },

    },
    watch: {

        "socketIO.connected"() {
            if (this.socketIO.connected) {
                this.agentStatusList[""] = "online";
            } else {
                this.agentStatusList[""] = "offline";
            }
        },

        // Reload the SPA if the server version is changed.
        "info.version"(to, from) {
            if (from && from !== to) {
                window.location.reload();
            }
        },
    },
    created() {
        this.initSocketIO();
    },
    mounted() {
        return;

    },
    methods: {

        endpointDisplayFunction(endpoint : string) {
            for (const v of Object.values(this.$data.agentList)) {
                if (endpoint) {
                    if (endpoint === v["endpoint"] && v["name"] !== "") {
                        return v["name"];
                    }
                    if (endpoint === v["endpoint"] && v["name"] === "" ) {
                        return endpoint;
                    }
                }
            }
        },

        /**
         * Initialize connection to socket server
         * @param bypass Should the check for if we
         * are on a status page be bypassed?
         */
        initSocketIO(bypass = false) {
            // No need to re-init
            if (this.socketIO.initedSocketIO) {
                return;
            }

            this.socketIO.initedSocketIO = true;
            let connectingMsgTimeout = setTimeout(() => {
                this.socketIO.connecting = true;
            }, 1500);

            socket = io();

            // Handling events from agents
            let agentSocket = new AgentSocket();
            socket.on("agent", (eventName : unknown, ...args : unknown[]) => {
                agentSocket.call(eventName, ...args);
            });

            socket.on("connect", () => {
                console.log("Connected to the socket server");

                clearTimeout(connectingMsgTimeout);
                this.socketIO.connecting = false;

                this.socketIO.connectCount++;
                this.socketIO.connected = true;
                this.socketIO.showReverseProxyGuide = false;
                this.refreshSession();

                this.socketIO.firstConnect = false;
            });

            socket.on("disconnect", () => {
                this.loggedIn = false;
                console.log("disconnect");
                this.socketIO.connectionErrorMsg = `${this.$t("Lost connection to the socket server. Reconnecting...")}`;
                this.socketIO.connected = false;
            });

            socket.on("connect_error", (err) => {
                console.error(`Failed to connect to the backend. Socket.io connect_error: ${err.message}`);
                this.socketIO.connectionErrorMsg = `${this.$t("Cannot connect to the socket server.")} [${err}] ${this.$t("reconnecting...")}`;
                this.socketIO.showReverseProxyGuide = true;
                this.socketIO.connected = false;
                this.socketIO.firstConnect = false;
                this.socketIO.connecting = false;
            });

            // Custom Events

            socket.on("info", (info) => {
                this.info = info;
            });

            socket.on("authenticated", () => {
                this.refreshSession();
            });

            socket.on("unauthenticated", () => {
                this.allowLoginDialog = true;
            });

            agentSocket.on("terminalWrite", (terminalName, data) => {
                const terminal = terminalMap.get(terminalName);
                if (!terminal) {
                    //console.error("Terminal not found: " + terminalName);
                    return;
                }
                terminal.write(data);
            });

            agentSocket.on("projectList", (res) => {
                if (res.ok) {
                    this.projectsDirectoryPaths[res.endpoint || "current"] = res.projectsDirectoryPath;
                    if (!res.endpoint) {
                        this.projectList = res.projectList;
                    } else {
                        if (!this.allAgentProjectList[res.endpoint]) {
                            this.allAgentProjectList[res.endpoint] = {
                                projectList: {},
                            };
                        }
                        this.allAgentProjectList[res.endpoint].projectList = res.projectList;
                    }
                }
            });

            socket.on("agentStatus", (res) => {
                this.agentStatusList[res.endpoint] = res.status;

                if (res.msg) {
                    this.toastError(res.msg);
                }
            });

            socket.on("agentList", (res) => {
                if (res.ok) {
                    this.agentList = res.agentList;
                }
            });

            socket.on("refresh", () => {
                location.reload();
            });
        },

        async refreshSession() {
            const { data } = await authClient.getSession();
            const response = await fetch("/api/dockgeek/session");
            const state = await response.json();
            this.loggedIn = !!data?.user && state.admin;
            this.superadmin = this.loggedIn && !!state.superadmin;
            this.username = data?.user?.name || data?.user?.email || null;
            this.allowLoginDialog = !this.loggedIn;
            if (this.loggedIn) {
                this.afterLogin();
            }
        },

        getSocket() : Socket {
            return socket;
        },

        emitAgent(endpoint : string, eventName : string, ...args : unknown[]) {
            this.getSocket().emit("agent", endpoint, eventName, ...args);
        },

        async logout() {
            await authClient.signOut();
            this.loggedIn = false;
            this.superadmin = false;
            this.username = null;
            this.clearData();
            socket.disconnect();
            socket.connect();
        },

        /**
         * @returns {void}
         */
        clearData() {

        },

        afterLogin() {

        },

        bindTerminal(endpoint : string, terminalName : string, terminal : Terminal, callback? : () => void, options? : { skipBuffer?: boolean }) {
            // Load terminal, get terminal screen
            this.emitAgent(endpoint, "terminalJoin", terminalName, (res) => {
                if (res.ok) {
                    if (!options?.skipBuffer && res.buffer) {
                        terminal.write(res.buffer);
                    }
                    terminalMap.set(terminalName, terminal);
                    callback?.();
                } else {
                    this.toastRes(res);
                }
            });
        },

        unbindTerminal(terminalName : string) {
            terminalMap.delete(terminalName);
        },

    }
});
