import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { Stack } from "../stack";
import { AgentSocket } from "../../common/agent-socket";
import { matchesFilePatterns } from "../../common/util-common";
import { promises as fs } from "node:fs";
import path from "node:path";
export class DockerSocketHandler extends AgentSocketHandler {
    create(socket : DockgeSocket, server : DockgeServer, agentSocket : AgentSocket) {
        // Do not call super.create()

        agentSocket.on("deployStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, filename : unknown, draftFiles : unknown, callback) => {
            try {
                checkLogin(socket);
                const stack = await this.saveStack(server, name, composeYAML, composeENV, isAdd, filename, draftFiles);
                await stack.deploy(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deployed",
                    msgi18n: true,
                    name: stack.name,
                    projectDir: stack.fullPath,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("saveStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, filename : unknown, draftFiles : unknown, callback) => {
            try {
                checkLogin(socket);
                const stack = await this.saveStack(server, name, composeYAML, composeENV, isAdd, filename, draftFiles);
                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                    name: stack.name,
                    projectDir: stack.fullPath,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteStack", async (name : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof(name) !== "string") {
                    throw new ValidationError("Name must be a string");
                }
                const stack = await Stack.getStack(server, name);

                try {
                    await stack.delete(socket);
                } catch (e) {
                    server.sendStackList();
                    throw e;
                }

                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deleted",
                    msgi18n: true,
                }, callback);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);

                callbackResult({
                    ok: true,
                    stack: await stack.toJSON(socket.endpoint),
                    composeFilePatterns: server.composeFilePatterns,
                    editableFilePatterns: server.editableFilePatterns,
                    files: await this.listEditableFiles(server, stack),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("listStackFiles", async (name : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof name !== "string") {
                    throw new ValidationError("Project name must be a string");
                }
                const stack = await Stack.getStack(server, name);
                callbackResult({ ok: true,
                    files: await this.listEditableFiles(server, stack) }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("readStackFile", async (name : unknown, filename : unknown, callback) => {
            try {
                checkLogin(socket);
                const stack = await this.editableStack(server, name, filename);
                const target = path.join(stack.fullPath, filename as string);
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

        agentSocket.on("writeStackFile", async (name : unknown, filename : unknown, content : unknown, create : unknown, callback) => {
            try {
                checkLogin(socket);
                const stack = await this.editableStack(server, name, filename);
                if (typeof content !== "string" || Buffer.byteLength(content) > 1024 * 1024) {
                    throw new ValidationError("File must be text smaller than 1 MiB");
                }
                if (typeof create !== "boolean") {
                    throw new ValidationError("Invalid file operation");
                }
                const target = path.join(stack.fullPath, filename as string);
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
                    files: await this.listEditableFiles(server, stack) }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("renameStackFile", async (name : unknown, filename : unknown, newFilename : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof name !== "string" || typeof filename !== "string" || typeof newFilename !== "string") {
                    throw new ValidationError("Invalid filename");
                }
                const stack = await Stack.getStack(server, name);
                const isCompose = filename === stack.composeFilePath.split(path.sep).pop();
                const patterns = isCompose ? server.composeFilePatterns : server.editableFilePatterns;
                if (!matchesFilePatterns(filename, patterns) || !matchesFilePatterns(newFilename, patterns) || !stack.isManagedByDockge
                    || !Stack.isPathInside(await fs.realpath(server.stacksDir), await fs.realpath(stack.fullPath))) {
                    throw new ValidationError("Filename is not allowed");
                }
                const original = path.join(stack.fullPath, filename);
                if (!(await fs.lstat(original)).isFile()) {
                    throw new ValidationError("File must be a regular file");
                }
                const target = path.join(stack.fullPath, newFilename);
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
                    files: await this.listEditableFiles(server, stack) }, callback);
                if (isCompose) {
                    server.sendStackList();
                }
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteStackFile", async (name : unknown, filename : unknown, callback) => {
            try {
                checkLogin(socket);
                const stack = await this.editableStack(server, name, filename);
                const target = path.join(stack.fullPath, filename as string);
                if (!(await fs.lstat(target)).isFile()) {
                    throw new ValidationError("File must be a regular file");
                }
                await fs.unlink(target);
                callbackResult({ ok: true,
                    files: await this.listEditableFiles(server, stack) }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // requestStackList
        agentSocket.on("requestStackList", async (callback) => {
            try {
                checkLogin(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // startStack
        agentSocket.on("startStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.start(socket);
                callbackResult({
                    ok: true,
                    msg: "Started",
                    msgi18n: true,
                }, callback);
                server.sendStackList();

            } catch (e) {
                callbackError(e, callback);
            }
        });

        // stopStack
        agentSocket.on("stopStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.stop(socket);
                callbackResult({
                    ok: true,
                    msg: "Stopped",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // restartStack
        agentSocket.on("restartStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.restart(socket);
                callbackResult({
                    ok: true,
                    msg: "Restarted",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // updateStack
        agentSocket.on("updateStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.update(socket);
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // down stack
        agentSocket.on("downStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.down(socket);
                callbackResult({
                    ok: true,
                    msg: "Downed",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Services status
        agentSocket.on("serviceStatusList", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Project name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                const serviceStatusList = Object.fromEntries(await stack.getServiceStatusList());
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
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Start a service
        agentSocket.on("startService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof (stackName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Project name and service name must be strings");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.startService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " started"
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Stop a service
        agentSocket.on("stopService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof (stackName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Project name and service name must be strings");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.stopService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " stopped"
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("restartService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof stackName !== "string" || typeof serviceName !== "string") {
                    throw new Error("Invalid stackName or serviceName");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.restartService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " restarted"
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("startContainer", async (stackName: unknown, containerName: unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof containerName !== "string") {
                    throw new ValidationError("Project name and container name must be strings");
                }
                const stack = await Stack.getStack(server, stackName);
                await stack.runContainerAction(containerName, "start");
                callbackResult({ ok: true,
                    msg: "Started",
                    msgi18n: true }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("stopContainer", async (stackName: unknown, containerName: unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof containerName !== "string") {
                    throw new ValidationError("Project name and container name must be strings");
                }
                const stack = await Stack.getStack(server, stackName);
                await stack.runContainerAction(containerName, "stop");
                callbackResult({ ok: true,
                    msg: "Stopped",
                    msgi18n: true }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("restartContainer", async (stackName: unknown, containerName: unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof containerName !== "string") {
                    throw new ValidationError("Project name and container name must be strings");
                }
                const stack = await Stack.getStack(server, stackName);
                await stack.runContainerAction(containerName, "restart");
                callbackResult({ ok: true,
                    msg: "Restarted",
                    msgi18n: true }, callback);
                server.sendStackList();
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

    async editableStack(server : DockgeServer, name : unknown, filename : unknown) : Promise<Stack> {
        if (typeof name !== "string" || typeof filename !== "string" || !matchesFilePatterns(filename, server.editableFilePatterns)) {
            throw new ValidationError("Editable filename is not allowed");
        }
        const stack = await Stack.getStack(server, name);
        if (!stack.isManagedByDockge || !Stack.isPathInside(await fs.realpath(server.stacksDir), await fs.realpath(stack.fullPath))) {
            throw new ValidationError("Project is not managed by Dockge");
        }
        return stack;
    }

    async listEditableFiles(server : DockgeServer, stack : Stack) : Promise<string[]> {
        if (!stack.isManagedByDockge) {
            return [];
        }
        const files = await fs.readdir(stack.fullPath, { withFileTypes: true });
        return files.filter(file => file.isFile() && matchesFilePatterns(file.name, server.editableFilePatterns))
            .map(file => file.name).sort();
    }

    async saveStack(server : DockgeServer, name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, filename : unknown, draftFiles : unknown) : Promise<Stack> {
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
        const stack = isAdd
            ? new Stack(server, name, composeYAML, composeENV, false)
            : await Stack.getStack(server, name);
        stack.setComposeFileName(filename);
        if (!isAdd) {
            stack.setComposeContent(composeYAML, composeENV);
        }
        await stack.save(isAdd);
        if (isAdd) {
            for (const [ file, content ] of Object.entries(draftFiles)) {
                await fs.writeFile(path.join(stack.fullPath, file), content as string, { flag: "wx", mode: 0o600 });
            }
        }
        return stack;
    }

}
