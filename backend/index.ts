import { DockgeekServer } from "./dockge-server";
import { log } from "./log";

log.info("server", "Welcome to dockgeek!");
const server = new DockgeekServer();
await server.serve();
