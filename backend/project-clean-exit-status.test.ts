import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { Project } from "./project";
import { CREATED_PROJECT, DEAD, EXITED, RUNNING, STOPPED, UNKNOWN } from "../common/util-common";

type ContainerState = {
    Status: string;
    ExitCode?: number;
    Error?: string;
};

describe("clean-exit compose status", () => {
    const originalGetStates = Project.getProjectContainerStates;

    afterEach(() => {
        Project.getProjectContainerStates = originalGetStates;
    });

    function stubStates(states: ContainerState[] | null) {
        Project.getProjectContainerStates = async () => states;
    }

    test("statusConvert still maps unmixed statuses", () => {
        assert.equal(Project.statusConvert("running(2)"), RUNNING);
        assert.equal(Project.statusConvert("exited(1)"), EXITED);
        assert.equal(Project.statusConvert("created"), CREATED_PROJECT);
        assert.equal(Project.statusConvert("exited(1), running(2)"), EXITED);
    });

    test("resolveComposeStatus upgrades exit-0 + running to RUNNING", async () => {
        stubStates([
            {
                Status: "running",
                ExitCode: 0,
            },
            {
                Status: "exited",
                ExitCode: 0,
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(2)",
        }), RUNNING);
    });

    test("resolveComposeStatus keeps EXITED when any exit code is non-zero", async () => {
        stubStates([
            {
                Status: "running",
            },
            {
                Status: "exited",
                ExitCode: 1,
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);
    });

    test("resolveComposeStatus does not upgrade paused or restarting mixtures", async () => {
        stubStates([
            {
                Status: "running",
            },
            {
                Status: "paused",
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);

        stubStates([
            {
                Status: "running",
            },
            {
                Status: "restarting",
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);

        stubStates([
            {
                Status: "running",
            },
            {
                Status: "dead",
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);
    });

    test("resolveComposeStatus returns UNKNOWN on missing or incomplete inspect data", async () => {
        stubStates(null);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), UNKNOWN);

        stubStates([]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), UNKNOWN);

        stubStates([
            {
                Status: "running",
            },
            {
                Status: "exited",
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);
    });

    test("resolveComposeStatus returns UNKNOWN when inspect throws", async () => {
        Project.getProjectContainerStates = async () => {
            throw new Error("docker unavailable");
        };
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), UNKNOWN);
    });

    test("resolveComposeStatus skips inspect for running-only statuses", async () => {
        let called = false;
        Project.getProjectContainerStates = async () => {
            called = true;
            return null;
        };
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "running(2)",
        }), RUNNING);
        assert.equal(called, false);
    });

    test("resolveComposeStatus inspects fully exited projects", async () => {
        stubStates(null);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(2)",
        }), EXITED);

        stubStates([
            {
                Status: "exited",
                ExitCode: 137,
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1)",
        }), STOPPED);
    });

    test("all exited containers remain STOPPED when exit codes are 0", async () => {
        stubStates([
            {
                Status: "exited",
                ExitCode: 0,
            },
            {
                Status: "exited",
                ExitCode: 0,
            },
        ]);
        assert.equal(await Project.resolveMixedRunningAndExited("demo"), STOPPED);
    });

    test("State.Error marks mixed projects DEAD", async () => {
        stubStates([
            {
                Status: "running",
            },
            {
                Status: "created",
                ExitCode: 128,
                Error: "Bind for 0.0.0.0:18019 failed: port is already allocated",
            },
        ]);
        assert.equal(await Project.resolveMixedRunningAndExited("demo"), DEAD);
    });

    test("created project with State.Error resolves to DEAD", async () => {
        stubStates([
            {
                Status: "created",
                ExitCode: 128,
                Error: "port is already allocated",
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "created(1)",
        }), DEAD);
    });

    test("created project without Error stays CREATED_PROJECT", async () => {
        stubStates([
            {
                Status: "created",
                ExitCode: 0,
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "created(1)",
        }), CREATED_PROJECT);
    });

    test("fully exited with 143 resolves to STOPPED", async () => {
        stubStates([
            {
                Status: "exited",
                ExitCode: 143,
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1)",
        }), STOPPED);
    });

    test("fully exited with crash code stays EXITED", async () => {
        stubStates([
            {
                Status: "exited",
                ExitCode: 1,
            },
        ]);
        assert.equal(await Project.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1)",
        }), EXITED);
    });

    test("mixed running with exited 143 stays RUNNING", async () => {
        stubStates([
            {
                Status: "running",
            },
            {
                Status: "exited",
                ExitCode: 143,
            },
        ]);
        assert.equal(await Project.resolveMixedRunningAndExited("demo"), RUNNING);
    });
});
