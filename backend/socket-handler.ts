import { DockgeekServer } from "./dockge-server";
import { DockgeekSocket } from "./util-server";

export abstract class SocketHandler {
    abstract create(socket : DockgeekSocket, server : DockgeekServer): void;
}
