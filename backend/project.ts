import { DockgeekServer } from "./dockge-server";
import fs, { promises as fsAsync } from "fs";
import { log } from "./log";
import yaml from "yaml";
import { DockgeekSocket, fileExists, ValidationError } from "./util-server";
import path from "path";
import {
    matchesFilePatterns,
    preferredMatchingFile,
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    CREATED_FILE,
    composeStatusToStatus,
    CREATED_PROJECT,
    DEAD,
    EXITED,
    formatContainerStatusLabel,
    getCombinedTerminalName,
    getComposeTerminalName, getContainerExecTerminalName, getContainerInstanceExecTerminalName,
    getContainerLogTerminalName,
    isCleanOrExternalStopExit,
    RESTARTING,
    RUNNING, TERMINAL_COLS, TERMINAL_ROWS,
    STOPPED,
    toComposeProjectName,
    UNKNOWN,
    validateProjectFolderName,
} from "../common/util-common";
import { InteractiveTerminal, Terminal } from "./terminal";
import * as childProcessAsync from "promisify-child-process";
import { Settings } from "./settings";

interface ComposeLsEntry {
    Name: string;
    Status: string;
    ConfigFiles?: string;
}

interface ContainerStateInfo {
    Status: string;
    ExitCode?: number;
    Error?: string;
    Name?: string;
    Created?: string;
}

export class Project {

    name: string;
    protected _status: number = UNKNOWN;
    protected _composeStatus?: string;
    protected _composeYAML?: string;
    protected _composeENV?: string;
    protected _projectDir?: string;
    protected _composeFileName: string = "compose.yaml";
    protected server: DockgeekServer;

    protected combinedTerminal? : Terminal;

    constructor(server : DockgeekServer, name : string, composeYAML? : string, composeENV? : string, skipFSOperations = false) {
        this.name = name;
        this.server = server;
        this._composeYAML = composeYAML;
        this._composeENV = composeENV;

        if (!skipFSOperations && fs.existsSync(this.path)) {
            const filename = preferredMatchingFile(fs.readdirSync(this.path).filter(file =>
                fs.lstatSync(path.join(this.path, file)).isFile()), server.composeFilePatterns);
            if (filename) {
                this._composeFileName = filename;
            }
        }
    }

    /**
     * Whether child path is inside parent path (after resolve).
     */
    static isPathInside(parent : string, child : string) : boolean {
        const resolvedParent = path.resolve(parent);
        const resolvedChild = path.resolve(child);
        const relative = path.relative(resolvedParent, resolvedChild);
        return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
    }

    async toJSON(endpoint : string) : Promise<object> {

        // Since we have multiple agents now, embed primary hostname in the project object too.
        let primaryHostname = await Settings.get("primaryHostname");
        if (!primaryHostname) {
            if (!endpoint) {
                primaryHostname = "localhost";
            } else {
                // Use the endpoint as the primary hostname
                try {
                    primaryHostname = (new URL("https://" + endpoint).hostname);
                } catch {
                    // Just in case if the endpoint is in a incorrect format
                    primaryHostname = "localhost";
                }
            }
        }

        let obj = this.toSimpleJSON(endpoint);
        return {
            ...obj,
            composeYAML: this.composeYAML,
            composeENV: this.composeENV,
            primaryHostname,
        };
    }

    toSimpleJSON(endpoint : string) : object {
        return {
            name: this.name,
            status: this._status,
            composeStatus: this._composeStatus,
            tags: [],
            isManagedByDockgeek: this.isManagedByDockgeek,
            composeFileName: this._composeFileName,
            projectDir: this.fullPath,
            folderName: path.basename(this.fullPath),
            endpoint,
        };
    }

    /**
     * Get the status of the project from `docker compose ps --format json`
     */
    async ps() : Promise<object> {
        let res = await childProcessAsync.spawn("docker", this.getComposeOptions("ps", "--format", "json"), {
            cwd: this.composeCwd,
            encoding: "utf-8",
        });
        if (!res.stdout) {
            return {};
        }
        return JSON.parse(res.stdout.toString());
    }

    get isManagedByDockgeek() : boolean {
        const projectDir = this.fullPath;
        if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
            return false;
        }
        return Project.isPathInside(this.server.projectsDir, projectDir)
            && matchesFilePatterns(this._composeFileName, this.server.composeFilePatterns)
            && fs.existsSync(this.composeFilePath);
    }

    get status() : number {
        return this._status;
    }

    /**
     * Allow-list project names so path.join(projectsDir, name) cannot escape projectsDir.
     * Port of louislam/dockge#997 (76d1785008d924a9f82074096067d6c259b2c0aa).
     */
    static validateName(name: unknown) {
        if (typeof name !== "string" || !name.match(/^[a-z0-9_-]+$/)) {
            throw new ValidationError("Project name can only contain [a-z][0-9] _ - only");
        }
    }

    validate() {
        // Compose project name (API id) must remain Compose-valid; folder names are validated separately on create
        if (!this.name.match(/^[a-z0-9][a-z0-9_-]*$/)) {
            throw new ValidationError("Compose project name can only contain [a-z0-9_-] and must start with [a-z0-9]");
        }

        // Check YAML format
        yaml.parse(this.composeYAML);

        let lines = this.composeENV.split("\n");

        // Check if the .env is able to pass docker-compose
        // Prevent "setenv: The parameter is incorrect"
        // It only happens when there is one line and it doesn't contain "="
        if (lines.length === 1 && !lines[0].includes("=") && lines[0].length > 0) {
            throw new ValidationError("Invalid .env format");
        }
    }

    setComposeFileName(filename : string) {
        if (!matchesFilePatterns(filename, this.server.composeFilePatterns)) {
            throw new ValidationError("Compose filename is not allowed by the configured pattern");
        }
        if (filename !== this._composeFileName && fs.existsSync(this.path)) {
            throw new ValidationError("Rename the existing Compose file separately");
        }
        this._composeFileName = filename;
    }

    setComposeContent(composeYAML : string, composeENV : string) {
        this._composeYAML = composeYAML;
        this._composeENV = composeENV;
    }

    get composeYAML() : string {
        if (this._composeYAML === undefined) {
            try {
                this._composeYAML = fs.readFileSync(path.join(this.path, this._composeFileName), "utf-8");
            } catch {
                this._composeYAML = "";
            }
        }
        return this._composeYAML;
    }

    get composeENV() : string {
        if (this._composeENV === undefined) {
            try {
                this._composeENV = fs.readFileSync(path.join(this.path, ".env"), "utf-8");
            } catch {
                this._composeENV = "";
            }
        }
        return this._composeENV;
    }

    get path() : string {
        if (this._projectDir) {
            return this._projectDir;
        }
        return path.join(this.server.projectsDir, this.name);
    }

    get fullPath() : string {
        let dir = this.path;

        // if dir is relative, make it absolute
        if (!path.isAbsolute(dir)) {
            return path.join(process.cwd(), dir);
        }
        return dir;
    }

    /**
     * Absolute path to the compose file used for `-f`.
     */
    get composeFilePath() : string {
        return path.join(this.fullPath, this._composeFileName);
    }

    /**
     * Neutral cwd for compose/docker spawns; project is selected via flags.
     */
    get composeCwd() : string {
        return path.resolve(this.server.projectsDir);
    }

    /**
     * Save the project to the disk
     * @param isAdd On create, `this.name` is treated as the folder basename (any valid name);
     *              it is then replaced with the derived Compose project name.
     */
    async save(isAdd : boolean) {
        let dir = this.path;
        if (!matchesFilePatterns(this._composeFileName, this.server.composeFilePatterns)) {
            throw new ValidationError("Compose filename is not allowed by the configured pattern");
        }

        // Check if the name is used if isAdd
        if (isAdd) {
            const folderName = this.name.trim();
            try {
                validateProjectFolderName(folderName);
            } catch (e) {
                throw new ValidationError(e instanceof Error ? e.message : "Invalid folder name");
            }

            const declaredName = yaml.parse(this.composeYAML)?.name;
            const composeName = typeof declaredName === "string" ? declaredName : toComposeProjectName(folderName);
            dir = path.join(this.server.projectsDir, folderName);
            this._projectDir = path.resolve(dir);
            this.name = composeName;

            this.validate();

            if (await fileExists(dir)) {
                throw new ValidationError("Project folder already exists");
            }
            const projects = await Project.getProjectList(this.server);
            if (projects.has(this.name)) {
                throw new ValidationError("Compose project name already exists");
            }

            // Create the project folder (preserves original casing / characters)
            await fsAsync.mkdir(dir);
        } else {
            this.validate();

            if (!this.isManagedByDockgeek) {
                throw new ValidationError("Project is not managed by Dockgeek");
            }
            if (!await fileExists(dir)) {
                throw new ValidationError("Project not found");
            }
        }

        // Never follow a symlink when writing an allowed file.
        const composePath = path.join(dir, this._composeFileName);
        try {
            if (!fs.lstatSync(composePath).isFile()) {
                throw new ValidationError("Compose file must be a regular file");
            }
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                throw e;
            }
        }
        fs.writeFileSync(composePath, this.composeYAML);
        if (process.env.PUID && process.env.PGID) {
            const uid = Number(process.env.PUID);
            const gid = Number(process.env.PGID);
            fs.lchownSync(dir, uid, gid);
            fs.chownSync(path.join(dir, this._composeFileName), uid, gid);
        }

        // Write or overwrite the .env
        // Port of louislam/dockge#979 (9872ce7dc512c09fbf5772855d8a6dc70a167699).
        const envPath = path.join(dir, ".env");
        if (await fileExists(envPath) || this.composeENV.trim() !== "") {
            try {
                if (!(await fsAsync.lstat(envPath)).isFile()) {
                    throw new ValidationError("Environment file must be a regular file");
                }
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw e;
                }
            }
            await fsAsync.writeFile(envPath, this.composeENV);
            if (process.env.PUID && process.env.PGID) {
                const uid = Number(process.env.PUID);
                const gid = Number(process.env.PGID);
                fs.chownSync(envPath, uid, gid);
            }
        }
    }

    async deploy(socket : DockgeekSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--remove-orphans"), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error("Failed to deploy, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async delete(socket: DockgeekSocket) : Promise<number> {
        if (!this.isManagedByDockgeek) {
            throw new ValidationError("Project is not managed by Dockgeek");
        }

        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("down", "--remove-orphans"), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error("Failed to delete, please check the terminal output for more information.");
        }

        // A compose file may back several -p projects. Keep it until the last
        // project using that file is removed.
        const remaining = await Project.getProjectList(this.server);
        if (![ ...remaining.values() ].some(project => project.name !== this.name && project.composeFilePath === this.composeFilePath)) {
            await fsAsync.rm(this.path, {
                recursive: true,
                force: true
            });
        }

        return exitCode;
    }

    async updateStatus() {
        let statusList = await Project.getStatusList();
        const entry = statusList.get(this.name);
        this._status = entry?.status ?? UNKNOWN;
        this._composeStatus = entry?.composeStatus;
    }

    static async getComposeProjects(): Promise<{ Name: string; Status: string; ConfigFiles: string }[]> {
        const result = await childProcessAsync.spawn("docker", [ "compose", "ls", "--all", "--format", "json" ], { encoding: "utf-8" });
        return result.stdout ? JSON.parse(result.stdout.toString()) : [];
    }

    static async getProjectList(server : DockgeekServer) : Promise<Map<string, Project>> {
        // A local compose file is a draft only until Compose reports a project for it.
        // Multiple -p projects may share that file; each keeps its own Compose name.
        const byFile = new Map<string, Project>();
        for (const folder of await fsAsync.readdir(server.projectsDir)) {
            try {
                const projectDir = path.resolve(server.projectsDir, folder);
                if (!(await fsAsync.lstat(projectDir)).isDirectory()) {
                    continue;
                }
                const files = await fsAsync.readdir(projectDir);
                const composeFile = preferredMatchingFile(files.filter(filename =>
                    fs.lstatSync(path.join(projectDir, filename)).isFile()), server.composeFilePatterns);
                if (!composeFile) {
                    continue;
                }
                const project = new Project(server, folder);
                project._projectDir = projectDir;
                project._composeFileName = composeFile;
                project.name = toComposeProjectName(folder);
                try {
                    const document = yaml.parse(project.composeYAML);
                    if (typeof document?.name === "string" && /^[a-z0-9][a-z0-9_-]*$/.test(document.name)) {
                        project.name = document.name;
                    }
                } catch {
                    // Still list draft files with invalid YAML so they can be edited.
                }
                project._status = CREATED_FILE;
                byFile.set(project.composeFilePath, project);
            } catch (e) {
                log.warn("getProjectList", `Failed to read project folder ${folder}: ${e instanceof Error ? e.message : e}`);
            }
        }

        const composeList = await this.getComposeProjects();
        const projectList = new Map<string, Project>();
        for (const composeProject of composeList) {
            const configFile = typeof composeProject.ConfigFiles === "string" ? composeProject.ConfigFiles.split(",")[0].trim() : "";
            if (!configFile) {
                continue;
            }
            const file = path.resolve(configFile);
            // The Dockgeek Compose project is not a managed project; keep other
            // Compose names (including legacy user-owned "dockge") unchanged.
            if (composeProject.Name === "dockgeek" && !Project.isPathInside(server.projectsDir, file)) {
                continue;
            }
            const project = new Project(server, composeProject.Name, undefined, undefined, true);
            project._projectDir = path.dirname(file);
            project._composeFileName = path.basename(file);
            project._status = await this.resolveComposeStatus(composeProject);
            project._composeStatus = composeProject.Status;
            projectList.set(composeProject.Name, project);
            byFile.delete(file); // A Compose project exists: no separate draft for this file.
        }

        for (const project of byFile.values()) {
            if (projectList.has(project.name)) {
                log.warn("getProjectList", `Compose project name "${project.name}" already exists; cannot show draft ${project.composeFilePath}`);
                continue;
            }
            projectList.set(project.name, project);
        }
        return projectList;
    }

    /**
     * Get the status list, it will be used to update the status of the projects
     * Not all status will be returned, only the project that is deployed or created to `docker compose` will be returned
     */
    static async getStatusList() : Promise<Map<string, { status: number; composeStatus: string }>> {
        const statusList = new Map<string, { status: number; composeStatus: string }>();

        let res = await childProcessAsync.spawn("docker", [ "compose", "ls", "--all", "--format", "json" ], {
            encoding: "utf-8",
        });

        if (!res.stdout) {
            return statusList;
        }

        let composeList = JSON.parse(res.stdout.toString());

        for (let composeProject of composeList) {
            statusList.set(composeProject.Name, {
                status: await this.resolveComposeStatus(composeProject),
                composeStatus: composeProject.Status,
            });
        }

        return statusList;
    }

    /**
     * Inspect project containers via docker, excluding Compose one-off containers.
     * Uses structured State.Status / State.ExitCode (not human-readable Status text).
     * Adapted from louislam/dockge#950 (99979e352bb2bbe869107ce455e7e2a7df5b7b7b).
     */
    static async getProjectContainerStates(composeName: string): Promise<ContainerStateInfo[] | null> {
        let idsRes = await childProcessAsync.spawn("docker", [
            "ps", "-aq",
            "--filter", `label=com.docker.compose.project=${composeName}`,
        ], {
            encoding: "utf-8",
        });

        if (!idsRes.stdout) {
            return null;
        }

        const ids = idsRes.stdout.toString().trim().split("\n").filter(Boolean);
        if (ids.length === 0) {
            return null;
        }

        let inspectRes = await childProcessAsync.spawn("docker", [
            "inspect",
            "--format", "{{json .}}",
            ...ids,
        ], {
            encoding: "utf-8",
        });

        if (!inspectRes.stdout) {
            return null;
        }

        const lines = inspectRes.stdout.toString().trim().split("\n").filter(Boolean);
        const states: ContainerStateInfo[] = [];

        for (const line of lines) {
            let parsed: {
                Name?: string;
                Created?: string;
                State?: {
                    Status?: string;
                    ExitCode?: number;
                    Error?: string;
                };
                Config?: {
                    Labels?: Record<string, string>;
                };
            };
            try {
                parsed = JSON.parse(line);
            } catch {
                return null;
            }

            if (parsed.Config?.Labels?.["com.docker.compose.oneoff"] === "True") {
                continue;
            }

            const status = parsed.State?.Status;
            if (typeof status !== "string" || status.length === 0) {
                return null;
            }

            const error = parsed.State?.Error;
            states.push({
                Status: status.toLowerCase(),
                ExitCode: parsed.State?.ExitCode,
                Error: typeof error === "string" && error.length > 0 ? error : undefined,
                Name: typeof parsed.Name === "string" ? parsed.Name.replace(/^\//, "") : undefined,
                Created: parsed.Created,
            });
        }

        return states;
    }

    /**
     * Mixed exited+running from `docker compose ls` is RUNNING only when at least one
     * container is running and every other counted container exited cleanly (0) or
     * via external stop (137/143).
     */
    static async resolveMixedRunningAndExited(composeName: string): Promise<number> {
        const composeStatus = await this.getProjectContainerStates(composeName);

        if (composeStatus === null) {
            return UNKNOWN;
        }

        if (composeStatus.length === 0) {
            return UNKNOWN;
        }

        let anyRunning = false;

        for (const containerStatus of composeStatus) {
            if (containerStatus.Error) {
                return DEAD;
            }

            if (containerStatus.Status === "running") {
                anyRunning = true;
                continue;
            }

            if (containerStatus.Status === "exited") {
                if (!isCleanOrExternalStopExit(containerStatus.ExitCode)) {
                    return EXITED;
                }
                continue;
            }

            // paused / restarting / dead / created / removing / etc.
            return EXITED;
        }

        return anyRunning ? RUNNING : STOPPED;
    }

    /**
     * Fully stopped projects: warning (STOPPED) for exit 0 / 137 / 143 only;
     * danger (EXITED) for other codes; DEAD when State.Error is set.
     */
    static async resolveFullyExited(composeName: string): Promise<number> {
        const composeStatus = await this.getProjectContainerStates(composeName);

        if (composeStatus === null || composeStatus.length === 0) {
            return EXITED;
        }

        for (const containerStatus of composeStatus) {
            if (containerStatus.Error) {
                return DEAD;
            }

            if (containerStatus.Status === "running") {
                // Unexpected for a pure exited compose-ls status; fall back.
                return EXITED;
            }

            if (containerStatus.Status === "exited") {
                if (!isCleanOrExternalStopExit(containerStatus.ExitCode)) {
                    return EXITED;
                }
                continue;
            }

            return EXITED;
        }

        return STOPPED;
    }

    /**
     * Resolve a project's status from a `docker compose ls` entry, upgrading
     * EXITED to RUNNING when the only exited containers are clean init
     * containers (exit 0) alongside running services. See issue #806 / PR #950.
     */
    static async resolveComposeStatus(composeProject: ComposeLsEntry): Promise<number> {
        const status = this.statusConvert(composeProject.Status);
        if (status === EXITED && typeof composeProject.Status === "string" && composeProject.Status.includes("running")) {
            try {
                return await this.resolveMixedRunningAndExited(composeProject.Name);
            } catch (e) {
                if (e instanceof Error) {
                    log.warn("resolveComposeStatus", `Failed to inspect project ${composeProject.Name}: ${e.message}`);
                }
                return UNKNOWN;
            }
        }

        if (status === EXITED) {
            try {
                return await this.resolveFullyExited(composeProject.Name);
            } catch (e) {
                if (e instanceof Error) {
                    log.warn("resolveComposeStatus", `Failed to inspect project ${composeProject.Name}: ${e.message}`);
                }
                return EXITED;
            }
        }

        // `docker compose ls` can report "created" while State.Error is set
        // (e.g. port already allocated). Surface that as dead/red.
        if (status === CREATED_PROJECT || status === RESTARTING) {
            try {
                const states = await this.getProjectContainerStates(composeProject.Name);
                if (states?.some((s) => !!s.Error)) {
                    return DEAD;
                }
            } catch (e) {
                if (e instanceof Error) {
                    log.warn("resolveComposeStatus", `Failed to inspect project ${composeProject.Name}: ${e.message}`);
                }
            }
        }

        return status;
    }

    /**
     * Convert the status string from `docker compose ls` to the status number
     * Input Example: "exited(1), running(1)"
     * @param status
     */
    static statusConvert(status : string) : number {
        return composeStatusToStatus(status);
    }

    static async getProject(server: DockgeekServer, projectName: string) : Promise<Project> {
        // Reject path-escaping lookups before touching the filesystem.
        Project.validateName(projectName);
        const projectList = await this.getProjectList(server);
        const project = projectList.get(projectName);
        if (!project) {
            throw new ValidationError("Project not found");
        }
        return project;
    }

    getComposeOptions(command : string, ...extraOptions : string[]) {
        const projectDir = this.fullPath;
        const composeFile = this.composeFilePath;
        let options = [
            "compose",
            "--project-directory", projectDir,
            "-f", composeFile,
            "-p", this.name,
        ];

        const globalEnvPath = path.join(path.resolve(this.server.projectsDir), "global.env");
        const projectEnvPath = path.join(projectDir, ".env");

        // When global.env is used, Compose no longer auto-loads project .env unless passed explicitly
        if (fs.existsSync(globalEnvPath)) {
            options.push("--env-file", globalEnvPath);
            if (fs.existsSync(projectEnvPath)) {
                options.push("--env-file", projectEnvPath);
            }
        }

        options.push(command, ...extraOptions);
        console.log(options);
        return options;
    }

    async start(socket: DockgeekSocket) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--remove-orphans"), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error("Failed to start, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async stop(socket: DockgeekSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("stop"), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error("Failed to stop, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async restart(socket: DockgeekSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("restart"), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error("Failed to restart, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async down(socket: DockgeekSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("down"), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error("Failed to down, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async update(socket: DockgeekSocket) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("pull"), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error("Failed to pull, please check the terminal output for more information.");
        }

        // If the project is not running, we don't need to restart it
        await this.updateStatus();
        log.debug("update", "Status: " + this.status);
        if (this.status !== RUNNING) {
            return exitCode;
        }

        exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--remove-orphans"), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error("Failed to restart, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async joinCombinedTerminal(socket: DockgeekSocket) {
        const terminalName = getCombinedTerminalName(socket.endpoint, this.name);
        const terminal = Terminal.getOrCreateTerminal(this.server, terminalName, "docker", this.getComposeOptions("logs", "-f", "--tail", "100"), this.composeCwd);
        terminal.enableKeepAlive = true;
        terminal.rows = COMBINED_TERMINAL_ROWS;
        terminal.cols = COMBINED_TERMINAL_COLS;
        terminal.join(socket);
        terminal.start();
    }

    async leaveCombinedTerminal(socket: DockgeekSocket) {
        const terminalName = getCombinedTerminalName(socket.endpoint, this.name);
        const terminal = Terminal.getTerminal(terminalName);
        if (terminal) {
            terminal.leave(socket);
        }
    }

    async joinContainerTerminal(socket: DockgeekSocket, serviceName: string, shell : string = "sh", index: number = 0) {
        const terminalName = getContainerExecTerminalName(socket.endpoint, this.name, serviceName, index, shell);
        let terminal = Terminal.getTerminal(terminalName);

        if (!terminal) {
            terminal = new InteractiveTerminal(this.server, terminalName, "docker", this.getComposeOptions("exec", "-e", "TERM=xterm-256color", serviceName, shell), this.composeCwd);
            terminal.rows = TERMINAL_ROWS;
            log.debug("joinContainerTerminal", "Terminal created");
        }

        terminal.join(socket);
        terminal.start();
    }

    /**
     * Leave a Compose service terminal and close its PTY when unused.
     *
     * @param socket Socket leaving the terminal
     * @param serviceName Compose service name
     * @param shell Shell executable
     * @param index Compose replica index
     */
    leaveContainerTerminal(socket: DockgeekSocket, serviceName: string, shell: string, index: number = 0) {
        const terminalName = getContainerExecTerminalName(socket.endpoint, this.name, serviceName, index, shell);
        const terminal = Terminal.getTerminal(terminalName);
        if (terminal) {
            terminal.leave(socket);
            if (!terminal.hasClients) {
                terminal.close();
            }
        }
    }

    async getServiceStatusList() {
        let statusList = new Map<string, Array<object>>();

        try {
            let res = await childProcessAsync.spawn("docker", this.getComposeOptions("ps", "--all", "--format", "json"), {
                cwd: this.composeCwd,
                encoding: "utf-8",
            });

            if (!res.stdout) {
                return statusList;
            }

            let lines = res.stdout?.toString().split("\n");

            const addLine = (obj: {
                ID: string,
                Service: string,
                State: string,
                Name: string,
                Health: string,
                Image: string,
                Command: string,
                CreatedAt: string,
                Ports: string,
                ExitCode?: number,
                Status?: string,
                Publishers?: Array<object>
            }) => {
                if (!statusList.has(obj.Service)) {
                    statusList.set(obj.Service, []);
                }
                statusList.get(obj.Service)?.push({
                    id: obj.ID,
                    service: obj.Service,
                    status: formatContainerStatusLabel(obj),
                    statusDetail: obj.Status || undefined,
                    state: obj.State,
                    health: obj.Health,
                    exitCode: obj.ExitCode,
                    name: obj.Name,
                    image: obj.Image,
                    command: obj.Command,
                    createdAt: obj.CreatedAt,
                    ports: obj.Ports,
                    publishers: obj.Publishers || [],
                });
            };

            for (let line of lines) {
                try {
                    let obj = JSON.parse(line);
                    if (obj instanceof Array) {
                        obj.forEach(addLine);
                    } else {
                        addLine(obj);
                    }
                } catch {
                }
            }

            // compose ps omits State.Error and can report ExitCode 0 for
            // failed "created" containers; merge from docker inspect.
            const inspectStates = await Project.getProjectContainerStates(this.name);
            if (inspectStates?.length) {
                const byName = new Map(
                    inspectStates
                        .filter((s) => s.Name)
                        .map((s) => [ s.Name as string, s ]),
                );
                for (const containers of statusList.values()) {
                    for (const container of containers as Array<{
                        name?: string;
                        exitCode?: number;
                        error?: string;
                        createdAt?: string;
                    }>) {
                        const info = container.name ? byName.get(container.name) : undefined;
                        if (!info) {
                            continue;
                        }
                        if (info.Error) {
                            container.error = info.Error;
                        }
                        if (typeof info.ExitCode === "number" && Number.isFinite(info.ExitCode)) {
                            container.exitCode = info.ExitCode;
                        }
                        if (info.Created) {
                            container.createdAt = info.Created;
                        }
                    }
                }
            }

            return statusList;
        } catch (e) {
            log.error("getServiceStatusList", e);
            return statusList;
        }
    }

    /**
     * Resolve a container by name and verify that it belongs to this project.
     *
     * @param containerName Docker container name
     * @returns Container status returned by Docker Compose
     */
    async getContainer(containerName: string) : Promise<Record<string, unknown>> {
        const serviceStatusList = await this.getServiceStatusList();
        for (const containers of serviceStatusList.values()) {
            const container = containers.find((item) => (item as { name?: string }).name === containerName);
            if (container) {
                return container as Record<string, unknown>;
            }
        }
        throw new ValidationError(`Container ${containerName} does not belong to project ${this.name}.`);
    }

    /**
     * Join a read-only log stream for one container instance.
     *
     * @param socket Socket joining the terminal
     * @param containerName Docker container name
     * @returns Terminal name used by the frontend
     */
    async joinContainerLogs(socket: DockgeekSocket, containerName: string) : Promise<string> {
        const container = await this.getContainer(containerName);
        const terminalName = getContainerLogTerminalName(socket.endpoint, this.name, containerName);
        const terminal = Terminal.getOrCreateTerminal(
            this.server,
            terminalName,
            "docker",
            [ "logs", "--follow", "--tail", "200", String(container.id) ],
            this.composeCwd
        );
        terminal.enableKeepAlive = true;
        terminal.rows = COMBINED_TERMINAL_ROWS;
        terminal.cols = TERMINAL_COLS;
        terminal.join(socket);
        terminal.start();
        return terminalName;
    }

    /**
     * Leave a container log stream.
     *
     * @param socket Socket leaving the terminal
     * @param containerName Docker container name
     */
    async leaveContainerLogs(socket: DockgeekSocket, containerName: string) {
        const terminalName = getContainerLogTerminalName(socket.endpoint, this.name, containerName);
        const terminal = Terminal.getTerminal(terminalName);
        terminal?.leave(socket);
    }

    /**
     * Open an interactive shell for one concrete container instance.
     *
     * @param socket Socket joining the terminal
     * @param containerName Docker container name
     * @param shell Shell executable
     */
    async joinContainerInstanceTerminal(socket: DockgeekSocket, containerName: string, shell: string) {
        const container = await this.getContainer(containerName);
        const terminalName = getContainerInstanceExecTerminalName(socket.endpoint, this.name, containerName, shell);
        let terminal = Terminal.getTerminal(terminalName);
        if (!terminal) {
            terminal = new InteractiveTerminal(
                this.server,
                terminalName,
                "docker",
                [ "exec", "-it", "-e", "TERM=xterm-256color", String(container.id), shell ],
                this.composeCwd
            );
            terminal.rows = TERMINAL_ROWS;
        }
        terminal.join(socket);
        terminal.start();
    }

    /**
     * Leave an interactive container terminal and close it when unused.
     *
     * @param socket Socket leaving the terminal
     * @param containerName Docker container name
     * @param shell Shell executable
     */
    leaveContainerInstanceTerminal(socket: DockgeekSocket, containerName: string, shell: string) {
        const terminalName = getContainerInstanceExecTerminalName(socket.endpoint, this.name, containerName, shell);
        const terminal = Terminal.getTerminal(terminalName);
        if (terminal) {
            terminal.leave(socket);
            if (!terminal.hasClients) {
                terminal.close();
            }
        }
    }

    /**
     * Run a lifecycle action against one verified container instance.
     *
     * @param containerName Docker container name
     * @param action Docker lifecycle action
     */
    async runContainerAction(containerName: string, action: "start" | "stop" | "restart") {
        const container = await this.getContainer(containerName);
        const result = await childProcessAsync.spawn("docker", [ action, String(container.id) ], {
            cwd: this.composeCwd,
            encoding: "utf-8",
        });
        if (result.code !== 0) {
            throw new Error(`Failed to ${action} container ${containerName}.`);
        }
    }

    async startService(socket: DockgeekSocket, serviceName: string) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", serviceName), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error(`Failed to start service ${serviceName}, please check logs for more information.`);
        }

        return exitCode;
    }

    async stopService(socket: DockgeekSocket, serviceName: string): Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("stop", serviceName), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error(`Failed to stop service ${serviceName}, please check logs for more information.`);
        }

        return exitCode;
    }

    async restartService(socket: DockgeekSocket, serviceName: string): Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("restart", serviceName), this.composeCwd);
        if (exitCode !== 0) {
            throw new Error(`Failed to restart service ${serviceName}, please check logs for more information.`);
        }

        return exitCode;
    }
}
