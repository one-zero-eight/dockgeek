import { test } from "node:test";
import assert from "node:assert/strict";
import { isDockerRootless } from "./docker-rootless";

test("isDockerRootless returns boolean or null against the local daemon", async () => {
    const result = await isDockerRootless();
    assert.ok(result === true || result === false || result === null);
});
