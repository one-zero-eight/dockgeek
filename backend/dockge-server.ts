import "dotenv/config";
import { MainRouter } from "./routers/main-router";
import * as fs from "node:fs";
import { PackageJson } from "type-fest";
import { Database } from "./database";
import packageJSON from "../package.json";
import { log } from "./log";
import * as socketIO from "socket.io";
import express, { Express } from "express";
import { parse } from "ts-command-line-args";
import https from "https";
import http from "http";
import { Router } from "./router";
import { Socket } from "socket.io";
import { MainSocketHandler } from "./socket-handlers/main-socket-handler";
import { SocketHandler } from "./socket-handler";
import { Settings } from "./settings";
import checkVersion from "./check-version";
import dayjs from "dayjs";
import { DEFAULT_COMPOSE_FILE_PATTERNS, DEFAULT_EDITABLE_FILE_PATTERNS, isDev, LooseObject } from "../common/util-common";
import { Arguments, Config, DockgeekSocket, SocketPrincipal } from "./util-server";
import { DockerSocketHandler } from "./agent-socket-handlers/docker-socket-handler";
import expressStaticGzip from "express-static-gzip";
import path from "path";
import { TerminalSocketHandler } from "./agent-socket-handlers/terminal-socket-handler";
import { Project } from "./project";
import { Cron } from "croner";
import gracefulShutdown from "http-graceful-shutdown";
import * as childProcessAsync from "promisify-child-process";
import { AgentManager } from "./agent-manager";
import { AgentProxySocketHandler } from "./socket-handlers/agent-proxy-socket-handler";
import { AgentSocketHandler } from "./agent-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import { ManageAgentSocketHandler } from "./socket-handlers/manage-agent-socket-handler";
import { Terminal } from "./terminal";
import { FileManager } from "./file-manager";
import { FileManagerSocketHandler } from "./agent-socket-handlers/file-manager-socket-handler";
import { toNodeHandler } from "better-auth/node";
import { claimAdmin, getAuth, getLoginOptions, initAuth, isAdmin, isSuperAdmin, secretHash, sessionUser, verifyAgentKey } from "./auth";

export class DockgeekServer {
    app : Express;
    httpServer : http.Server;
    packageJSON : PackageJson;
    io : socketIO.Server;
    config : Config;
    indexHTML : string = "";

    /**
     * List of express routers
     */
    routerList : Router[] = [
        new MainRouter(),
    ];

    /**
     * List of socket handlers (no agent support)
     */
    socketHandlerList : SocketHandler[] = [
        new MainSocketHandler(),
        new ManageAgentSocketHandler(),
    ];

    agentProxySocketHandler = new AgentProxySocketHandler();

    /**
     * List of socket handlers (support agent)
     */
    agentSocketHandlerList : AgentSocketHandler[] = [
        new DockerSocketHandler(),
        new TerminalSocketHandler(),
        new FileManagerSocketHandler(),
    ];

    projectsDir : string = "";
    composeFilePatterns = DEFAULT_COMPOSE_FILE_PATTERNS;
    editableFilePatterns = DEFAULT_EDITABLE_FILE_PATTERNS;

    fileManager? : FileManager;

    /**
     *
     */
    constructor() {
        // Catch unexpected errors here
        let unexpectedErrorHandler = (error : unknown) => {
            console.trace(error);
            console.error("If you keep encountering errors, please report to https://github.com/one-zero-eight/dockgeek");
        };
        process.addListener("unhandledRejection", unexpectedErrorHandler);
        process.addListener("uncaughtException", unexpectedErrorHandler);

        if (!process.env.NODE_ENV) {
            process.env.NODE_ENV = "production";
        }

        // Log NODE ENV
        log.info("server", "NODE_ENV: " + process.env.NODE_ENV);

        // Default projects directory
        let defaultProjectsDir;
        if (process.platform === "win32") {
            defaultProjectsDir = "./projects";
        } else {
            defaultProjectsDir = "/opt/projects";
        }

        // Define all possible arguments
        let args = parse<Arguments>({
            sslKey: {
                type: String,
                optional: true,
            },
            sslCert: {
                type: String,
                optional: true,
            },
            sslKeyPassphrase: {
                type: String,
                optional: true,
            },
            port: {
                type: Number,
                optional: true,
            },
            hostname: {
                type: String,
                optional: true,
            },
            dataDir: {
                type: String,
                optional: true,
            },
            projectsDir: {
                type: String,
                optional: true,
            },
            enableConsole: {
                type: Boolean,
                optional: true,
                defaultValue: false,
            },
            fileManagerRoot: {
                type: String,
                optional: true,
            },
            fileManagerMaxFileSize: {
                type: Number,
                optional: true,
            },
        });

        this.config = args as Config;

        // Load from environment variables or default values if args are not set
        this.config.sslKey = args.sslKey || process.env.DOCKGEEK_SSL_KEY || undefined;
        this.config.sslCert = args.sslCert || process.env.DOCKGEEK_SSL_CERT || undefined;
        this.config.sslKeyPassphrase = args.sslKeyPassphrase || process.env.DOCKGEEK_SSL_KEY_PASSPHRASE || undefined;
        this.config.port = args.port || Number(process.env.DOCKGEEK_PORT) || 5001;
        this.config.hostname = args.hostname || process.env.DOCKGEEK_HOSTNAME || undefined;
        this.config.dataDir = args.dataDir || process.env.DOCKGEEK_DATA_DIR || "/app/dockgeek-data";
        process.env.DOCKGEEK_DATA_DIR = this.config.dataDir;
        this.config.projectsDir = args.projectsDir || process.env.DOCKGEEK_PROJECTS_DIR || defaultProjectsDir;
        this.config.enableConsole = args.enableConsole || process.env.DOCKGEEK_ENABLE_CONSOLE === "true" || false;
        this.config.fileManagerRoot = args.fileManagerRoot || process.env.DOCKGEEK_FILE_MANAGER_ROOT || undefined;
        this.config.fileManagerMaxFileSize = args.fileManagerMaxFileSize
            ?? (process.env.DOCKGEEK_FILE_MANAGER_MAX_FILE_SIZE !== undefined
                ? Number(process.env.DOCKGEEK_FILE_MANAGER_MAX_FILE_SIZE)
                : 100 * 1024 * 1024);
        if (!Number.isFinite(this.config.fileManagerMaxFileSize) || this.config.fileManagerMaxFileSize <= 0) {
            throw new Error("DOCKGEEK_FILE_MANAGER_MAX_FILE_SIZE must be a positive number of bytes.");
        }
        this.projectsDir = this.config.projectsDir;

        log.debug("server", this.config);

        this.packageJSON = packageJSON as PackageJson;

        if (!isDev) {
            try {
                this.indexHTML = fs.readFileSync("./frontend-dist/index.html", "utf-8");
            } catch {
                log.error("server", "Error: Cannot find 'frontend-dist/index.html', did you install correctly?");
                process.exit(1);
            }
        }

        // Create express
        this.app = express();

        // Create HTTP server
        if (this.config.sslKey && this.config.sslCert) {
            log.info("server", "Server Type: HTTPS");
            this.httpServer = https.createServer({
                key: fs.readFileSync(this.config.sslKey),
                cert: fs.readFileSync(this.config.sslCert),
                passphrase: this.config.sslKeyPassphrase,
            }, this.app);
        } else {
            log.info("server", "Server Type: HTTP");
            this.httpServer = http.createServer(this.app);
        }

        // Better Auth and claim endpoints are registered before the SPA fallback.
        this.app.all("/api/auth/*splat", (req, res) => toNodeHandler(getAuth())(req, res));
        this.app.get("/api/dockgeek/login-options", (_req, res) => res.json(getLoginOptions()));
        this.app.get("/api/dockgeek/session", async (req, res) => {
            const userId = await sessionUser(req.headers);
            res.json({ admin: !!userId && await isAdmin(userId), superadmin: !!userId && await isSuperAdmin(userId), userId });
        });
        this.app.post("/api/dockgeek/claim", express.json(), async (req, res) => {
            const userId = await sessionUser(req.headers);
            if (!userId || !await claimAdmin(userId, req.body?.token)) {
                res.status(403).json({ ok: false });
                return;
            }
            res.json({ ok: true });
        });

        // Binding Routers
        for (const router of this.routerList) {
            this.app.use(router.create(this.app, this));
        }

        // Vite serves the frontend in development; this server only handles APIs and sockets.
        if (!isDev) {
            this.app.use("/", expressStaticGzip("frontend-dist", {
                enableBrotli: true,
            }));

            // Universal Route Handler, must be at the end of all express routes.
            this.app.get("/{*splat}", (_request, response) => {
                response.send(this.indexHTML);
            });
        }

        // Allow all CORS origins in development
        let cors = undefined;
        if (isDev) {
            cors = {
                origin: "*",
            };
        }

        // Create Socket.io
        this.io = new socketIO.Server(this.httpServer, {
            cors,
            allowRequest: (req, callback) => {
                let isOriginValid = true;
                const bypass = isDev || process.env.UPTIME_KUMA_WS_ORIGIN_CHECK === "bypass";

                if (!bypass) {
                    let host = req.headers.host;

                    // If this is set, it means the request is from the browser
                    let origin = req.headers.origin;

                    // If this is from the browser, check if the origin is allowed
                    if (origin) {
                        try {
                            let originURL = new URL(origin);

                            if (host !== originURL.host) {
                                isOriginValid = false;
                                log.error("auth", `Origin (${origin}) does not match host (${host}), IP: ${req.socket.remoteAddress}`);
                            }
                        } catch {
                            // Invalid origin url, probably not from browser
                            isOriginValid = false;
                            log.error("auth", `Invalid origin url (${origin}), IP: ${req.socket.remoteAddress}`);
                        }
                    } else {
                        log.info("auth", `Origin is not set, IP: ${req.socket.remoteAddress}`);
                    }
                } else {
                    log.debug("auth", "Origin check is bypassed");
                }

                callback(null, isOriginValid);
            }
        });

        this.io.use(async (socket, next) => {
            const key = socket.handshake.auth.agentKey;
            if (!key) {
                next();
                return;
            }
            const endpoint = socket.handshake.auth.endpoint;
            if (typeof key !== "string" || typeof endpoint !== "string" || !await verifyAgentKey(key, endpoint)) {
                next(new Error("Invalid agent key"));
                return;
            }
            next();
        });

        this.io.on("connection", async (socket: Socket) => {
            let dockgeekSocket = socket as DockgeekSocket;
            dockgeekSocket.instanceManager = new AgentManager(dockgeekSocket);
            dockgeekSocket.emitAgent = (event : string, ...args : unknown[]) => {
                let obj = args[0];
                if (typeof(obj) === "object") {
                    let obj2 = obj as LooseObject;
                    obj2.endpoint = dockgeekSocket.endpoint;
                }
                dockgeekSocket.emit("agent", event, ...args);
            };

            dockgeekSocket.endpoint = typeof socket.handshake.auth.endpoint === "string" ? socket.handshake.auth.endpoint : "";
            const agentKey = typeof socket.handshake.auth.agentKey === "string" ? socket.handshake.auth.agentKey : "";
            if (agentKey && !dockgeekSocket.endpoint) {
                dockgeekSocket.disconnect();
                return;
            }
            const authorize = async () => {
                let principal : SocketPrincipal | undefined;
                if (agentKey && await verifyAgentKey(agentKey, dockgeekSocket.endpoint)) {
                    principal = { kind: "agent", keyHash: secretHash(agentKey), endpoint: dockgeekSocket.endpoint };
                } else if (!agentKey && !dockgeekSocket.endpoint) {
                    const userId = await sessionUser(socket.request.headers);
                    if (userId && await isAdmin(userId)) {
                        principal = { kind: "admin", userId };
                    }
                }

                if (!principal) {
                    if (dockgeekSocket.principal) {
                        dockgeekSocket.principal = undefined;
                        dockgeekSocket.disconnect();
                    }
                    return false;
                }

                const current = dockgeekSocket.principal;
                const changed = !current || (principal.kind === "admin"
                    ? current.kind !== "admin" || current.userId !== principal.userId
                    : current.kind !== "agent" || current.keyHash !== principal.keyHash);
                if (changed) {
                    if (dockgeekSocket.principal) {
                        dockgeekSocket.instanceManager.disconnectAll();
                        dockgeekSocket.instanceManager = new AgentManager(dockgeekSocket);
                    }
                    await this.afterLogin(dockgeekSocket, principal);
                }
                return true;
            };
            dockgeekSocket.use(async (packet, next) => {
                try {
                    if (agentKey && packet[0] !== "agent") {
                        next(new Error("Agent keys may only use agent events"));
                        return;
                    }
                    if (!await authorize()) {
                        next(new Error("Unauthorized"));
                        return;
                    }
                    next();
                } catch (error) {
                    next(error instanceof Error ? error : new Error("Unauthorized"));
                }
            });

            if (dockgeekSocket.endpoint) {
                log.info("server", "Socket connected (agent), as endpoint " + dockgeekSocket.endpoint);
            } else {
                log.info("server", "Socket connected (direct)");
            }

            this.sendInfo(dockgeekSocket, true);

            // Create socket handlers (original, no agent support)
            for (const socketHandler of this.socketHandlerList) {
                socketHandler.create(dockgeekSocket, this);
            }

            // Create Agent Socket
            let agentSocket = new AgentSocket();

            // Create agent socket handlers
            for (const socketHandler of this.agentSocketHandlerList) {
                socketHandler.create(dockgeekSocket, this, agentSocket);
            }

            // Create agent proxy socket handlers
            this.agentProxySocketHandler.create2(dockgeekSocket, this, agentSocket);

            // ***************************
            // Better do anything after added all socket handlers here
            // ***************************

            try {
                if (await authorize()) {
                    dockgeekSocket.emit("authenticated");
                } else {
                    dockgeekSocket.emit("unauthenticated");
                }
            } catch (error) {
                log.error("auth", error);
                dockgeekSocket.disconnect();
            }

            // Socket disconnect
            dockgeekSocket.on("disconnect", () => {
                log.info("server", "Socket disconnected!");
                dockgeekSocket.instanceManager.disconnectAll();
            });

        });

        this.io.on("disconnect", () => {

        });

        if (isDev) {
            setInterval(() => {
                log.debug("terminal", "Terminal count: " + Terminal.getTerminalCount());
            }, 5000);
        }
    }

    async afterLogin(socket : DockgeekSocket, principal : SocketPrincipal) {
        socket.principal = principal;
        socket.join(principal.kind === "admin" ? `user:${principal.userId}` : `agent:${principal.keyHash}`);

        this.sendInfo(socket);

        try {
            this.sendProjectList();
        } catch (e) {
            log.error("server", e);
        }

        if (principal.kind === "admin") {
            socket.instanceManager.sendAgentList();
            socket.instanceManager.connectAll();
        }
    }

    /**
     *
     */
    async serve() {
        // Create all the necessary directories
        this.initDataDir();

        // Connect to database
        try {
            await Database.init(this);
        } catch (e) {
            if (e instanceof Error) {
                log.error("server", "Failed to prepare your database: " + e.message);
            }
            process.exit(1);
        }

        await initAuth(`http://localhost:${this.config.port}`);
        const patterns = await Settings.filePatterns();
        this.composeFilePatterns = patterns.compose;
        this.editableFilePatterns = patterns.editable;

        // Listen
        this.httpServer.listen(this.config.port, this.config.hostname, () => {
            if (this.config.hostname) {
                log.info( "server", `Listening on ${this.config.hostname}:${this.config.port}`);
            } else {
                log.info("server", `Listening on ${this.config.port}`);
            }

            // Run every 10 seconds
            new Cron("*/10 * * * * *", {
                protect: true,  // Enabled over-run protection.
            }, () => {
                //log.debug("server", "Cron job running");
                this.sendProjectList();
            });

            checkVersion.startInterval();
        });

        gracefulShutdown(this.httpServer, {
            signals: "SIGINT SIGTERM",
            timeout: 30000,                   // timeout: 30 secs
            development: false,               // not in dev mode
            forceExit: true,                  // triggers process.exit() at the end of shutdown process
            onShutdown: this.shutdownFunction,     // shutdown function (async) - e.g. for cleanup DB, ...
            finally: this.finalFunction,            // finally function (sync) - e.g. for logging
        });

    }

    /**
     * Emits the version information to the client.
     * @param socket Socket.io socket instance
     * @param hideVersion Should we hide the version information in the response?
     * @returns
     */
    async sendInfo(socket : Socket, hideVersion = false) {
        let versionProperty;
        let latestVersionProperty;
        let isContainer;

        if (!hideVersion) {
            versionProperty = packageJSON.version;
            latestVersionProperty = checkVersion.latestVersion;
            isContainer = (process.env.DOCKGEEK_IS_CONTAINER === "1");
        }

        socket.emit("info", {
            version: versionProperty,
            latestVersion: latestVersionProperty,
            isContainer,
            primaryHostname: await Settings.get("primaryHostname"),
            //serverTimezone: await this.getTimezone(),
            //serverTimezoneOffset: this.getTimezoneOffset(),
        });
    }

    /**
     * Get the IP of the client connected to the socket
     * @param {Socket} socket Socket to query
     * @returns IP of client
     */
    async getClientIP(socket : Socket) : Promise<string> {
        let clientIP = socket.client.conn.remoteAddress;

        if (clientIP === undefined) {
            clientIP = "";
        }

        if (await Settings.get("trustProxy")) {
            const forwardedFor = socket.client.conn.request.headers["x-forwarded-for"];

            if (typeof forwardedFor === "string") {
                return forwardedFor.split(",")[0].trim();
            } else if (typeof socket.client.conn.request.headers["x-real-ip"] === "string") {
                return socket.client.conn.request.headers["x-real-ip"];
            }
        }
        return clientIP.replace(/^::ffff:/, "");
    }

    /**
     * Attempt to get the current server timezone
     * If this fails, fall back to environment variables and then make a
     * guess.
     * @returns {Promise<string>} Current timezone
     */
    async getTimezone() {
        // From process.env.TZ
        try {
            if (process.env.TZ) {
                this.checkTimezone(process.env.TZ);
                return process.env.TZ;
            }
        } catch (e) {
            if (e instanceof Error) {
                log.warn("timezone", e.message + " in process.env.TZ");
            }
        }

        const timezone = await Settings.get("serverTimezone");

        // From Settings
        try {
            log.debug("timezone", "Using timezone from settings: " + timezone);
            if (timezone) {
                this.checkTimezone(timezone);
                return timezone;
            }
        } catch (e) {
            if (e instanceof Error) {
                log.warn("timezone", e.message + " in settings");
            }
        }

        // Guess
        try {
            const guess = dayjs.tz.guess();
            log.debug("timezone", "Guessing timezone: " + guess);
            if (guess) {
                this.checkTimezone(guess);
                return guess;
            } else {
                return "UTC";
            }
        } catch {
            // Guess failed, fall back to UTC
            log.debug("timezone", "Guessed an invalid timezone. Use UTC as fallback");
            return "UTC";
        }
    }

    /**
     * Get the current offset
     * @returns {string} Time offset
     */
    getTimezoneOffset() {
        return dayjs().format("Z");
    }

    /**
     * Throw an error if the timezone is invalid
     * @param {string} timezone Timezone to test
     * @returns {void}
     * @throws The timezone is invalid
     */
    checkTimezone(timezone : string) {
        try {
            dayjs.utc("2013-11-18 11:55").tz(timezone).format();
        } catch {
            throw new Error("Invalid timezone:" + timezone);
        }
    }

    /**
     * Initialize the data directory
     */
    initDataDir() {
        if (! fs.existsSync(this.config.dataDir)) {
            fs.mkdirSync(this.config.dataDir, { recursive: true });
        }

        // Check if a directory
        if (!fs.lstatSync(this.config.dataDir).isDirectory()) {
            throw new Error(`Fatal error: ${this.config.dataDir} is not a directory`);
        }

        // Create data/projects directory
        if (!fs.existsSync(this.projectsDir)) {
            fs.mkdirSync(this.projectsDir, { recursive: true });
        }

        if (this.config.fileManagerRoot) {
            if (!fs.existsSync(this.config.fileManagerRoot)) {
                throw new Error(`File manager root does not exist: ${this.config.fileManagerRoot}`);
            }
            this.fileManager = new FileManager(this.config.fileManagerRoot, this.config.fileManagerMaxFileSize);
            log.info("server", `File Manager Root: ${this.fileManager.root}`);
        } else {
            log.info("server", "File Manager: disabled");
        }

        log.info("server", `Data Dir: ${this.config.dataDir}`);
    }

    /**
     * Send project list to all connected sockets.
     */
    async sendProjectList() {
        let socketList = this.io.sockets.sockets.values();

        let projectList;

        for (let socket of socketList) {
            let dockgeekSocket = socket as DockgeekSocket;

            if (dockgeekSocket.principal) {

                // Get the list only if there is a logged in principal
                if (!projectList) {
                    projectList = await Project.getProjectList(this);
                }

                let map : Map<string, object> = new Map();

                for (let [ projectName, project ] of projectList) {
                    map.set(projectName, project.toSimpleJSON(dockgeekSocket.endpoint));
                }

                log.debug("server", "Send project list to user: " + dockgeekSocket.id + " (" + dockgeekSocket.endpoint + ")");
                dockgeekSocket.emitAgent("projectList", {
                    ok: true,
                    projectList: Object.fromEntries(map),
                    projectsDirectoryPath: this.projectDirFullPath,
                });
            }
        }
    }

    async getDockerNetworkList() : Promise<string[]> {
        let res = await childProcessAsync.spawn("docker", [ "network", "ls", "--format", "{{.Name}}" ], {
            encoding: "utf-8",
        });

        if (!res.stdout) {
            return [];
        }

        let list = res.stdout.toString().split("\n");

        // Remove empty string item
        list = list.filter((item) => {
            return item !== "";
        }).sort((a, b) => {
            return a.localeCompare(b);
        });

        return list;
    }

    async getDockerStats() : Promise<Map<string, object>> {
        let stats = new Map<string, object>();

        try {
            let res = await childProcessAsync.spawn("docker", [ "stats", "--format", "json", "--no-stream" ], {
                encoding: "utf-8",
            });

            if (!res.stdout) {
                return stats;
            }

            let lines = res.stdout?.toString().split("\n");

            for (let line of lines) {
                try {
                    let obj = JSON.parse(line);
                    stats.set(obj.Name, obj);
                } catch {
                }
            }

            return stats;
        } catch (e) {
            log.error("getDockerStats", e);
            return stats;
        }
    }

    get projectDirFullPath() {
        return path.resolve(this.projectsDir);
    }

    /**
     * Shutdown the application
     * Stops all monitors and closes the database connection.
     * @param signal The signal that triggered this function to be called.
     */
    async shutdownFunction(signal : string | undefined) {
        log.info("server", "Shutdown requested");
        log.info("server", "Called signal: " + signal);

        // TODO: Close all terminals?

        await Database.close();
        Settings.stopCacheCleaner();
    }

    /**
     * Final function called before application exits
     */
    finalFunction() {
        log.info("server", "Graceful shutdown successful!");
    }

    /** Refresh other sockets, optionally restricted to one authenticated principal. */
    disconnectAllSocketClients(principal? : SocketPrincipal, currentSocketID? : string) {
        for (const rawSocket of this.io.sockets.sockets.values()) {
            const socket = rawSocket as DockgeekSocket;
            const current = socket.principal;
            const samePrincipal = !principal || (principal.kind === "admin"
                ? current?.kind === "admin" && current.userId === principal.userId
                : current?.kind === "agent" && current.keyHash === principal.keyHash);
            if (samePrincipal && socket.id !== currentSocketID) {
                try {
                    socket.emit("refresh");
                    socket.disconnect();
                } catch {

                }
            }
        }
    }

    isSSL() {
        return this.config.sslKey && this.config.sslCert;
    }

    getLocalWebSocketURL() {
        const protocol = this.isSSL() ? "wss" : "ws";
        const host = this.config.hostname || "localhost";
        return `${protocol}://${host}:${this.config.port}`;
    }

}
