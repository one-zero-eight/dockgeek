import pkg from "../package.json";
import fs from "fs";
import dayjs from "dayjs";

const oldVersion = pkg.version;
const newVersion = oldVersion + "-nightly-" + dayjs().format("YYYYMMDDHHmmss");

console.log("Old Version: " + oldVersion);
console.log("New Version: " + newVersion);

if (newVersion) {
    // Process package.json
    pkg.version = newVersion;
    fs.writeFileSync("package.json", JSON.stringify(pkg, null, 4) + "\n");
}
