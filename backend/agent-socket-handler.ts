import { DockgeekServer } from "./dockge-server";
import { AgentSocket } from "../common/agent-socket";
import { DockgeekSocket } from "./util-server";

export abstract class AgentSocketHandler {
    abstract create(socket : DockgeekSocket, server : DockgeekServer, agentSocket : AgentSocket): void;
}
