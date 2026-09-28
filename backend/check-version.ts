import packageJSON from "../package.json";

// No Dockgeek-owned update feed exists yet. Never query the upstream Dockge feed.
class CheckVersion {
    version = packageJSON.version;
    latestVersion? : string;

    async startInterval() {
        // Intentionally disabled until Dockgeek publishes its own version feed.
    }
}

const checkVersion = new CheckVersion();
export default checkVersion;
