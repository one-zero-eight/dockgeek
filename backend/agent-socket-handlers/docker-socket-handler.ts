import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeekServer } from "../dockge-server";
import { callbackError, callbackResult, checkGitOpsAdmin, checkLogin, DockgeekSocket, ValidationError } from "../util-server";
import { applyGitProject, deleteGitCredential, gitRootForProject, GitProjectPayload, listGitCredentials, previewGitProject, setGitCredential } from "../git-ops";
import { Project } from "../project";
import { AgentSocket } from "../../common/agent-socket";
import { matchesFilePatterns } from "../../common/util-common";
import { promises as fs } from "node:fs";
import path from "node:path";
export class DockerSocketHandler extends AgentSocketHandler {
    create(socket : DockgeekSocket, server : DockgeekServer, agentSocket : AgentSocket) {
        // Do not call super.create()

        agentSocket.on("deployProject", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, filename : unknown, draftFiles : unknown, callback) => {
            try {
                checkLogin(socket);
                const project = await this.saveProject(server, name, composeYAML, composeENV, isAdd, filename, draftFiles);
                await project.deploy(socket);
                server.sendProjectList();
                callbackResult({
                    ok: true,
                    msg: "Deployed",
                    msgi18n: true,
                    projectName: project.name,
                    projectDir: project.fullPath,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("saveProject", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, filename : unknown, draftFiles : unknown, callback) => {
            try {
                checkLogin(socket);
                const project = await this.saveProject(server, name, composeYAML, composeENV, isAdd, filename, draftFiles);
                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                    projectName: project.name,
                    projectDir: project.fullPath,
                }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteProject", async (name : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof(name) !== "string") {
                    throw new ValidationError("Name must be a string");
                }
                const project = await Project.getProject(server, name);

                try {
                    await project.delete(socket);
                } catch (e) {
                    server.sendProjectList();
                    throw e;
                }

                server.sendProjectList();
                callbackResult({
                    ok: true,
                    msg: "Deleted",
                    msgi18n: true,
                }, callback);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getProject", async (projectName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(projectName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const project = await Project.getProject(server, projectName);

                callbackResult({
                    ok: true,
                    project: await project.toJSON(socket.endpoint),
                    composeFilePatterns: server.composeFilePatterns,
                    editableFilePatterns: server.editableFilePatterns,
                    files: await this.listEditableFiles(server, project),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("listProjectFiles", async (name : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof name !== "string") {
                    throw new ValidationError("Project name must be a string");
                }
                const project = await Project.getProject(server, name);
                callbackResult({ ok: true,
                    files: await this.listEditableFiles(server, project) }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("readProjectFile", async (name : unknown, filename : unknown, callback) => {
            try {
                checkLogin(socket);
                const project = await this.editableProject(server, name, filename);
                const target = path.join(project.fullPath, filename as string);
                const stat = await fs.lstat(target);
                if (!stat.isFile() || stat.size > 1024 * 1024) {
                    throw new ValidationError("File must be a regular text file smaller than 1 MiB");
                }
                callbackResult({ ok: true,
                    content: await fs.readFile(target, "utf8") }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("writeProjectFile", async (name : unknown, filename : unknown, content : unknown, create : unknown, callback) => {
            try {
                checkLogin(socket);
                const project = await this.editableProject(server, name, filename);
                if (typeof content !== "string" || Buffer.byteLength(content) > 1024 * 1024) {
                    throw new ValidationError("File must be text smaller than 1 MiB");
                }
                if (typeof create !== "boolean") {
                    throw new ValidationError("Invalid file operation");
                }
                const target = path.join(project.fullPath, filename as string);
                try {
                    const stat = await fs.lstat(target);
                    if (!stat.isFile()) {
                        throw new ValidationError("File must be a regular file");
                    }
                } catch (e) {
                    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                        throw e;
                    }
                }
                const handle = await fs.open(target, create ? "wx" : "r+", 0o600);
                if (!create && !(await handle.stat()).isFile()) {
                    await handle.close();
                    throw new ValidationError("File must be a regular file");
                }
                try {
                    await handle.truncate(0);
                    await handle.writeFile(content);
                } finally {
                    await handle.close();
                }
                callbackResult({ ok: true,
                    files: await this.listEditableFiles(server, project) }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("renameProjectFile", async (name : unknown, filename : unknown, newFilename : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof name !== "string" || typeof filename !== "string" || typeof newFilename !== "string") {
                    throw new ValidationError("Invalid filename");
                }
                const project = await Project.getProject(server, name);
                const isCompose = filename === project.composeFilePath.split(path.sep).pop();
                const patterns = isCompose ? server.composeFilePatterns : server.editableFilePatterns;
                if (!matchesFilePatterns(filename, patterns) || !matchesFilePatterns(newFilename, patterns) || !project.isManagedByDockgeek
                    || !Project.isPathInside(await fs.realpath(server.projectsDir), await fs.realpath(project.fullPath))) {
                    throw new ValidationError("Filename is not allowed");
                }
                const original = path.join(project.fullPath, filename);
                if (!(await fs.lstat(original)).isFile()) {
                    throw new ValidationError("File must be a regular file");
                }
                const target = path.join(project.fullPath, newFilename);
                try {
                    await fs.lstat(target);
                    throw new ValidationError("Destination already exists");
                } catch (e) {
                    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                        throw e;
                    }
                }
                await fs.rename(original, target);
                callbackResult({ ok: true,
                    files: await this.listEditableFiles(server, project) }, callback);
                if (isCompose) {
                    server.sendProjectList();
                }
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteProjectFile", async (name : unknown, filename : unknown, callback) => {
            try {
                checkLogin(socket);
                const project = await this.editableProject(server, name, filename);
                const target = path.join(project.fullPath, filename as string);
                if (!(await fs.lstat(target)).isFile()) {
                    throw new ValidationError("File must be a regular file");
                }
                await fs.unlink(target);
                callbackResult({ ok: true,
                    files: await this.listEditableFiles(server, project) }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("previewGitProject", async (payload : GitProjectPayload, delegationOrCallback : unknown, remoteCallback? : unknown) => {
            const callback = remoteCallback ?? delegationOrCallback;
            try {
                checkGitOpsAdmin(socket, "previewGitProject", payload, remoteCallback ? delegationOrCallback : undefined);
                const preview = await previewGitProject(server, payload);
                callbackResult({ ok: true, ...preview }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("applyGitProject", async (payload : GitProjectPayload, delegationOrCallback : unknown, remoteCallback? : unknown) => {
            const callback = remoteCallback ?? delegationOrCallback;
            try {
                checkGitOpsAdmin(socket, "applyGitProject", payload, remoteCallback ? delegationOrCallback : undefined);
                const result = await applyGitProject(server, payload, async project => {
                    await project.deploy(socket);
                });
                server.sendProjectList();
                callbackResult({ ok: true, ...result }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("listGitCredentials", async (payload : { name: string }, delegationOrCallback : unknown, remoteCallback? : unknown) => {
            const callback = remoteCallback ?? delegationOrCallback;
            try {
                checkGitOpsAdmin(socket, "listGitCredentials", payload, remoteCallback ? delegationOrCallback : undefined);
                const root = await gitRootForProject(server, payload?.name);
                callbackResult({ ok: true, ...await listGitCredentials(server, root) }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("setGitCredential", async (payload : { name: string; type: "https" | "ssh"; username?: string; token?: string; privateKey?: string }, delegationOrCallback : unknown, remoteCallback? : unknown) => {
            const callback = remoteCallback ?? delegationOrCallback;
            try {
                checkGitOpsAdmin(socket, "setGitCredential", payload, remoteCallback ? delegationOrCallback : undefined);
                const root = await gitRootForProject(server, payload?.name);
                await setGitCredential(server, root, payload as Parameters<typeof setGitCredential>[2]);
                callbackResult({ ok: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteGitCredential", async (payload : { name: string }, delegationOrCallback : unknown, remoteCallback? : unknown) => {
            const callback = remoteCallback ?? delegationOrCallback;
            try {
                checkGitOpsAdmin(socket, "deleteGitCredential", payload, remoteCallback ? delegationOrCallback : undefined);
                await deleteGitCredential(server, await gitRootForProject(server, payload?.name));
                callbackResult({ ok: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // requestProjectList
        agentSocket.on("requestProjectList", async (callback) => {
            try {
                checkLogin(socket);
                server.sendProjectList();
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // startProject
        agentSocket.on("startProject", async (projectName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(projectName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const project = await Project.getProject(server, projectName);
                await project.start(socket);
                callbackResult({
                    ok: true,
                    msg: "Started",
                    msgi18n: true,
                }, callback);
                server.sendProjectList();

            } catch (e) {
                callbackError(e, callback);
            }
        });

        // stopProject
        agentSocket.on("stopProject", async (projectName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(projectName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const project = await Project.getProject(server, projectName);
                await project.stop(socket);
                callbackResult({
                    ok: true,
                    msg: "Stopped",
                    msgi18n: true,
                }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // restartProject
        agentSocket.on("restartProject", async (projectName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(projectName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const project = await Project.getProject(server, projectName);
                await project.restart(socket);
                callbackResult({
                    ok: true,
                    msg: "Restarted",
                    msgi18n: true,
                }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // updateProject
        agentSocket.on("updateProject", async (projectName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(projectName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const project = await Project.getProject(server, projectName);
                await project.update(socket);
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // down project
        agentSocket.on("downProject", async (projectName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(projectName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const project = await Project.getProject(server, projectName);
                await project.down(socket);
                callbackResult({
                    ok: true,
                    msg: "Downed",
                    msgi18n: true,
                }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Services status
        agentSocket.on("serviceStatusList", async (projectName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(projectName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const project = await Project.getProject(server, projectName);
                const serviceStatusList = Object.fromEntries(await project.getServiceStatusList());
                callbackResult({
                    ok: true,
                    serviceStatusList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Docker stats
        agentSocket.on("dockerStats", async (callback) => {
            try {
                checkLogin(socket);

                const dockerStats = Object.fromEntries(await server.getDockerStats());
                callbackResult({
                    ok: true,
                    dockerStats,
                }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Start a service
        agentSocket.on("startService", async (projectName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof (projectName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Project name and service name must be strings");
                }

                const project = await Project.getProject(server, projectName);
                await project.startService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " started"
                }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Stop a service
        agentSocket.on("stopService", async (projectName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof (projectName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Project name and service name must be strings");
                }

                const project = await Project.getProject(server, projectName);
                await project.stopService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " stopped"
                }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("restartService", async (projectName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof projectName !== "string" || typeof serviceName !== "string") {
                    throw new Error("Invalid projectName or serviceName");
                }

                const project = await Project.getProject(server, projectName);
                await project.restartService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " restarted"
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("startContainer", async (projectName: unknown, containerName: unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof projectName !== "string" || typeof containerName !== "string") {
                    throw new ValidationError("Project name and container name must be strings");
                }
                const project = await Project.getProject(server, projectName);
                await project.runContainerAction(containerName, "start");
                callbackResult({ ok: true,
                    msg: "Started",
                    msgi18n: true }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("stopContainer", async (projectName: unknown, containerName: unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof projectName !== "string" || typeof containerName !== "string") {
                    throw new ValidationError("Project name and container name must be strings");
                }
                const project = await Project.getProject(server, projectName);
                await project.runContainerAction(containerName, "stop");
                callbackResult({ ok: true,
                    msg: "Stopped",
                    msgi18n: true }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("restartContainer", async (projectName: unknown, containerName: unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof projectName !== "string" || typeof containerName !== "string") {
                    throw new ValidationError("Project name and container name must be strings");
                }
                const project = await Project.getProject(server, projectName);
                await project.runContainerAction(containerName, "restart");
                callbackResult({ ok: true,
                    msg: "Restarted",
                    msgi18n: true }, callback);
                server.sendProjectList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // getExternalNetworkList
        agentSocket.on("getDockerNetworkList", async (callback) => {
            try {
                checkLogin(socket);
                const dockerNetworkList = await server.getDockerNetworkList();
                callbackResult({
                    ok: true,
                    dockerNetworkList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    async editableProject(server : DockgeekServer, name : unknown, filename : unknown) : Promise<Project> {
        if (typeof name !== "string" || typeof filename !== "string" || !matchesFilePatterns(filename, server.editableFilePatterns)) {
            throw new ValidationError("Editable filename is not allowed");
        }
        const project = await Project.getProject(server, name);
        if (!project.isManagedByDockgeek || !Project.isPathInside(await fs.realpath(server.projectsDir), await fs.realpath(project.fullPath))) {
            throw new ValidationError("Project is not managed by Dockgeek");
        }
        return project;
    }

    async listEditableFiles(server : DockgeekServer, project : Project) : Promise<string[]> {
        if (!project.isManagedByDockgeek) {
            return [];
        }
        const files = await fs.readdir(project.fullPath, { withFileTypes: true });
        return files.filter(file => file.isFile() && file.name !== path.basename(project.composeFilePath) && matchesFilePatterns(file.name, server.editableFilePatterns))
            .map(file => file.name).sort();
    }

    async saveProject(server : DockgeekServer, name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, filename : unknown, draftFiles : unknown) : Promise<Project> {
        // Check types
        if (typeof(name) !== "string") {
            throw new ValidationError("Name must be a string");
        }
        if (typeof(composeYAML) !== "string") {
            throw new ValidationError("Compose YAML must be a string");
        }
        if (typeof(composeENV) !== "string") {
            throw new ValidationError("Compose ENV must be a string");
        }
        if (typeof(isAdd) !== "boolean") {
            throw new ValidationError("isAdd must be a boolean");
        }

        if (typeof filename !== "string") {
            throw new ValidationError("Compose filename must be a string");
        }
        if (!draftFiles || typeof draftFiles !== "object" || Array.isArray(draftFiles)
            || Object.entries(draftFiles).some(([ file, content ]) => !matchesFilePatterns(file, server.editableFilePatterns)
                || file === filename || typeof content !== "string" || Buffer.byteLength(content) > 1024 * 1024)) {
            throw new ValidationError("Invalid additional project files");
        }
        if (!isAdd && Object.keys(draftFiles).length) {
            throw new ValidationError("Additional files can only be created with a new project");
        }
        const project = isAdd
            ? new Project(server, name, composeYAML, composeENV, false)
            : await Project.getProject(server, name);
        project.setComposeFileName(filename);
        if (!isAdd) {
            project.setComposeContent(composeYAML, composeENV);
        }
        await project.save(isAdd);
        if (isAdd) {
            for (const [ file, content ] of Object.entries(draftFiles)) {
                await fs.writeFile(path.join(project.fullPath, file), content as string, { flag: "wx", mode: 0o600 });
            }
        }
        return project;
    }

}
