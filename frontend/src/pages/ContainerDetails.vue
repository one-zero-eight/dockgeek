<template>
    <transition name="slide-fade" appear>
        <div
            class="container-details-page"
            :class="{ 'logs-active': activeTab === 'logs' }"
            :style="containerDetailsStyle"
        >
            <nav class="detail-breadcrumb mb-[.5rem] flex flex-wrap gap-2 text-muted-foreground text-sm" aria-label="breadcrumb">
                <router-link :to="stackRoute">{{ stackName }}</router-link>
                <span>/</span>
                <span>{{ serviceName || $tc("container", 1) }}</span>
                <span>/</span>
                <span>{{ containerName }}</span>
            </nav>

            <div class="detail-header mb-[1rem] flex items-center justify-between gap-4">
                <div>
                    <div class="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                        <h1 class="mb-0 me-1">{{ containerName }}</h1>
                        <FloatingTooltip v-if="container && statusDetail" placement="top">
                            <template #trigger="{ triggerAttrs }">
                                <span v-bind="triggerAttrs" class="status-badge" :class="statusClass">{{ container.status }}</span>
                            </template>
                            <span class="floating-tooltip-detail">{{ statusDetail }}</span>
                        </FloatingTooltip>
                        <span v-else-if="container" class="status-badge" :class="statusClass">{{ container.status }}</span>
                        <span v-if="exitLabel" class="status-badge" :class="exitBadgeClass">{{ exitLabel }}</span>
                    </div>
                    <div v-if="errorLabel" class="mt-[.5rem]">
                        <ContainerError :message="errorLabel" />
                    </div>
                    <div v-if="serviceName" class="service-name mt-[.25rem] text-foreground">{{ $t("service") }}: {{ serviceName }}</div>
                </div>

                <div v-if="container" class="action-bar flex" role="group">
                    <button v-if="!isRunning" class="detail-button detail-button-primary" :disabled="processing" @click="performAction('startContainer')">
                        <font-awesome-icon icon="play" class="me-[.25rem]" /> {{ $t("startStack") }}
                    </button>
                    <button v-if="isRunning" class="detail-button" :disabled="processing" @click="performAction('restartContainer')">
                        <font-awesome-icon icon="rotate" class="me-[.25rem]" /> {{ $t("restartStack") }}
                    </button>
                    <button v-if="isRunning" class="detail-button" :disabled="processing" @click="performAction('stopContainer')">
                        <font-awesome-icon icon="stop" class="me-[.25rem]" /> {{ $t("stopStack") }}
                    </button>
                </div>
            </div>

            <div v-if="!loaded" class="panel-box big-padding">{{ $t("loadingContainer") }}</div>
            <div v-else-if="!container" class="panel-box big-padding empty-state text-muted-foreground">
                <h4>{{ $t("containerNotFound") }}</h4>
                <p class="mb-[1rem]">{{ $t("containerNotFoundDescription") }}</p>
                <router-link class="detail-button detail-button-primary" :to="stackRoute">{{ $t("backToStack") }}</router-link>
            </div>

            <template v-else>
                <div class="tabs-scroll mb-[1rem] overflow-x-auto">
                    <ul class="detail-tabs flex flex-nowrap list-none m-0 gap-1 min-w-max p-1 rounded-xl border border-border bg-background" role="tablist">
                        <li class="detail-tab-item">
                            <button
                                class="detail-tab"
                                :class="{ active: activeTab === 'overview' }"
                                role="tab"
                                :aria-selected="activeTab === 'overview'"
                                @click="setTab('overview')"
                            >
                                {{ $t("overview") }}
                            </button>
                        </li>
                        <li class="detail-tab-item">
                            <button
                                class="detail-tab"
                                :class="{ active: activeTab === 'logs' }"
                                role="tab"
                                :aria-selected="activeTab === 'logs'"
                                @click="setTab('logs')"
                            >
                                {{ $t("logs") }}
                            </button>
                        </li>
                        <li class="detail-tab-item">
                            <button
                                class="detail-tab"
                                :class="{ active: activeTab === 'terminal' }"
                                role="tab"
                                :aria-selected="activeTab === 'terminal'"
                                @click="setTab('terminal')"
                            >
                                {{ $t("terminal") }}
                            </button>
                        </li>
                    </ul>
                </div>

                <section v-if="activeTab === 'overview'" class="overview-grid grid gap-4">
                    <article class="detail-card panel-box min-w-0 p-5">
                        <div class="detail-label mb-[0.4rem] text-muted-foreground text-xs font-semibold uppercase">{{ $t("status") }}</div>
                        <div class="detail-value text-base font-semibold">{{ container.state || container.status }}</div>
                    </article>
                    <article class="detail-card panel-box min-w-0 p-5">
                        <div class="detail-label mb-[0.4rem] text-muted-foreground text-xs font-semibold uppercase">{{ $t("health") }}</div>
                        <div class="detail-value text-base font-semibold">{{ container.health || $t("notAvailableShort") }}</div>
                    </article>
                    <article class="detail-card panel-box image-card min-w-0 p-5">
                        <div class="detail-label mb-[0.4rem] text-muted-foreground text-xs font-semibold uppercase">{{ $t("dockerImage") }}</div>
                        <div class="detail-value text-base font-semibold break-words">{{ container.image || $t("notAvailableShort") }}</div>
                    </article>
                    <article class="detail-card panel-box min-w-0 p-5">
                        <div class="detail-label mb-[0.4rem] text-muted-foreground text-xs font-semibold uppercase">{{ $tc("port", 2) }}</div>
                        <div class="detail-value text-base font-semibold break-words">{{ container.ports || $t("notAvailableShort") }}</div>
                    </article>
                    <article class="detail-card panel-box min-w-0 p-5">
                        <div class="detail-label mb-[0.4rem] text-muted-foreground text-xs font-semibold uppercase">{{ $t("createdAt") }}</div>
                        <div class="detail-value text-base font-semibold">{{ container.createdAt || $t("notAvailableShort") }}</div>
                    </article>
                    <article class="detail-card panel-box min-w-0 p-5">
                        <div class="detail-label mb-[0.4rem] text-muted-foreground text-xs font-semibold uppercase">{{ $t("runningFor") }}</div>
                        <div class="detail-value text-base font-semibold">{{ container.runningFor || $t("notAvailableShort") }}</div>
                    </article>
                    <article class="detail-card panel-box min-w-0 p-5">
                        <div class="detail-label mb-[0.4rem] text-muted-foreground text-xs font-semibold uppercase">{{ $t("CPU") }}</div>
                        <div class="detail-value text-base font-semibold">{{ containerStats?.CPUPerc || $t("notAvailableShort") }}</div>
                    </article>
                    <article class="detail-card panel-box min-w-0 p-5">
                        <div class="detail-label mb-[0.4rem] text-muted-foreground text-xs font-semibold uppercase">{{ $t("memory") }}</div>
                        <div class="detail-value text-base font-semibold">{{ containerStats?.MemUsage || $t("notAvailableShort") }}</div>
                    </article>
                </section>

                <section v-if="activeTab === 'logs'" class="log-panel" :class="{ fullscreen: logFullscreen }">
                    <div class="log-toolbar flex flex-none flex-wrap gap-2 p-[0.65rem] bg-terminal-bar">
                        <button class="detail-button detail-button-sm" :class="{ active: followLogs }" @click="toggleFollow">
                            <font-awesome-icon :icon="followLogs ? 'pause' : 'play'" class="me-[.25rem]" />
                            {{ followLogs ? $t("pauseFollow") : $t("resumeFollow") }}
                        </button>
                        <button class="detail-button detail-button-sm" @click="clearLogs">
                            <font-awesome-icon icon="trash" class="me-[.25rem]" /> {{ $t("clearDisplay") }}
                        </button>
                        <button class="detail-button detail-button-sm" :disabled="!hasLogSelection" @click="copyLogs">
                            <font-awesome-icon icon="copy" class="me-[.25rem]" /> {{ $t("copySelection") }}
                        </button>
                        <button class="detail-button detail-button-sm ms-auto" @click="toggleFullscreen">
                            <font-awesome-icon :icon="logFullscreen ? 'compress' : 'expand'" class="me-[.25rem]" />
                            {{ logFullscreen ? $t("exitFullscreen") : $t("fullscreen") }}
                        </button>
                    </div>
                    <div class="log-body">
                        <Terminal
                            ref="logTerminal"
                            class="container-log-terminal terminal"
                            :name="logTerminalName"
                            :endpoint="endpoint"
                            :auto-follow="true"
                            :show-toolbar="false"
                            @ready="joinLogs"
                            @follow-change="followLogs = $event"
                            @selection-change="hasLogSelection = $event"
                        />
                    </div>
                </section>

                <section v-if="activeTab === 'terminal'">
                    <div v-if="!isRunning" class="panel-box big-padding empty-state text-muted-foreground">
                        {{ $t("terminalRequiresRunningContainer") }}
                    </div>
                    <template v-else>
                        <div class="flex items-center gap-2 mb-[1rem]">
                            <span>{{ $t("shell") }}:</span>
                            <div class="flex" role="group">
                                <button class="detail-button detail-button-sm" :class="{ 'detail-button-primary': shell === 'bash' }" @click="shell = 'bash'">bash</button>
                                <button class="detail-button detail-button-sm" :class="{ 'detail-button-primary': shell === 'sh' }" @click="shell = 'sh'">sh</button>
                            </div>
                        </div>
                        <Terminal
                            :key="shell"
                            class="instance-terminal terminal"
                            :name="instanceTerminalName"
                            :endpoint="endpoint"
                            :stack-name="stackName"
                            :container-name="containerName"
                            :shell="shell"
                            mode="interactiveContainer"
                            :rows="24"
                        />
                    </template>
                </section>
            </template>
        </div>
    </transition>
</template>

<script>
import {
    containerExitTone,
    containerStatusTone,
    formatContainerExitLabel,
    formatContainerError,
    getContainerInstanceExecTerminalName,
    getContainerLogTerminalName
} from "../../../common/util-common";
import ContainerError from "../components/ContainerError.vue";
import { FloatingTooltip } from "../components/floating";

export default {
    components: {
        ContainerError,
        FloatingTooltip,
    },
    data() {
        return {
            activeTab: "overview",
            containerStatusList: {},
            dockerStats: {},
            loaded: false,
            processing: false,
            pollInterval: null,
            shell: "bash",
            logJoined: false,
            logFullscreen: false,
            followLogs: true,
            hasLogSelection: false,
            availablePageHeight: 0,
        };
    },
    computed: {
        stackName() {
            return this.$route.params.stackName;
        },
        containerName() {
            return this.$route.params.containerName;
        },
        endpoint() {
            return this.$route.params.endpoint || "";
        },
        container() {
            for (const containers of Object.values(this.containerStatusList)) {
                const container = containers.find(item => item.name === this.containerName);
                if (container) {
                    return container;
                }
            }
            return null;
        },
        serviceName() {
            return this.container?.service || "";
        },
        containerStats() {
            return this.dockerStats[this.containerName] || null;
        },
        isRunning() {
            return this.container?.state === "running";
        },
        statusClass() {
            return `tone-${containerStatusTone(this.container)}`;
        },
        statusDetail() {
            return this.container?.statusDetail || this.container?.status;
        },
        exitLabel() {
            return formatContainerExitLabel(this.container);
        },
        exitBadgeClass() {
            const tone = containerExitTone(this.container);
            return tone ? `tone-${tone}` : "tone-secondary";
        },
        errorLabel() {
            return formatContainerError(this.container);
        },
        stackRoute() {
            return this.endpoint ? `/compose/${this.stackName}/${this.endpoint}` : `/compose/${this.stackName}`;
        },
        logTerminalName() {
            return getContainerLogTerminalName(this.endpoint, this.stackName, this.containerName);
        },
        instanceTerminalName() {
            return getContainerInstanceExecTerminalName(this.endpoint, this.stackName, this.containerName, this.shell);
        },
        containerDetailsStyle() {
            if (!this.availablePageHeight) {
                return {};
            }
            return {
                "--container-details-height": `${this.availablePageHeight}px`,
            };
        },
    },
    created() {
        const requestedTab = this.$route.query.tab;
        if ([ "overview", "logs", "terminal" ].includes(requestedTab)) {
            this.activeTab = requestedTab;
        }
    },
    mounted() {
        this.updateAvailableHeight();
        window.addEventListener("resize", this.updateAvailableHeight);
        this.refresh();
        this.pollInterval = window.setInterval(this.refresh, 5000);
    },
    unmounted() {
        window.clearInterval(this.pollInterval);
        window.removeEventListener("resize", this.updateAvailableHeight);
        this.leaveLogs();
    },
    methods: {
        refresh() {
            this.$root.emitAgent(this.endpoint, "serviceStatusList", this.stackName, (res) => {
                if (res.ok) {
                    this.containerStatusList = res.serviceStatusList;
                } else {
                    this.$root.toastRes(res);
                }
                this.loaded = true;
            });
            this.$root.emitAgent(this.endpoint, "dockerStats", (res) => {
                if (res.ok) {
                    this.dockerStats = res.dockerStats;
                }
            });
        },
        setTab(tab) {
            if (this.activeTab === "logs" && tab !== "logs") {
                this.leaveLogs();
                this.logFullscreen = false;
            }
            this.activeTab = tab;
            this.$nextTick(this.updateAvailableHeight);
        },
        /**
         * Fill the viewport below the page's current top edge without making the document scroll.
         */
        updateAvailableHeight() {
            let pageTop = 0;
            let element = this.$el;
            while (element) {
                pageTop += element.offsetTop;
                element = element.offsetParent;
            }
            pageTop -= window.scrollY;
            this.availablePageHeight = Math.max(0, window.innerHeight - pageTop - 16);
            if (this.activeTab === "logs") {
                this.$nextTick(() => this.$refs.logTerminal?.fit());
            }
        },
        performAction(eventName) {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, eventName, this.stackName, this.containerName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.refresh();
                }
            });
        },
        joinLogs() {
            if (this.logJoined) {
                return;
            }
            this.$root.emitAgent(this.endpoint, "joinContainerLogs", this.stackName, this.containerName, (res) => {
                if (res.ok) {
                    this.logJoined = true;
                    this.$nextTick(() => this.$refs.logTerminal?.fit());
                } else {
                    this.$root.toastRes(res);
                }
            });
        },
        leaveLogs() {
            if (!this.logJoined) {
                return;
            }
            this.logJoined = false;
            this.$root.emitAgent(this.endpoint, "leaveContainerLogs", this.stackName, this.containerName, () => {});
        },
        toggleFollow() {
            this.$refs.logTerminal?.setFollow(!this.followLogs);
        },
        clearLogs() {
            this.$refs.logTerminal?.clear();
        },
        copyLogs() {
            this.$refs.logTerminal?.copySelection();
        },
        toggleFullscreen() {
            this.logFullscreen = !this.logFullscreen;
            this.$nextTick(() => this.$refs.logTerminal?.fit());
        },
    },
};
</script>

<style scoped lang="scss">
.status-badge {
    display: inline-block; padding: 0.35em 0.65em; border-radius: 0.375rem;
    font-size: var(--font-size-meta-sm); font-weight: var(--font-weight-medium);
    line-height: 1; letter-spacing: 0.01em; color: var(--foreground);
    background: var(--muted);
}
.tone-primary { color: var(--primary-foreground); background: var(--primary); }
.tone-danger { color: white; background: var(--destructive); }
.tone-stopped { color: var(--primary-foreground); background: var(--warning); }
.tone-secondary { color: var(--foreground); background: var(--muted); }
.detail-button {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;
    min-height: 38px; padding: 0.375rem 0.75rem; border: 1px solid var(--secondary);
    border-radius: 0.375rem; color: var(--secondary-foreground); background: var(--secondary);
    font: inherit; line-height: 1.5; text-decoration: none; cursor: pointer;
    &:hover { color: var(--secondary-foreground); background: var(--secondary-hover); }
    &:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
    &:disabled { opacity: 0.65; cursor: not-allowed; }
    &.detail-button-primary { color: var(--primary-foreground); background: var(--primary); border-color: var(--primary); }
}
.detail-button-sm { min-height: 31px; padding: 0.25rem 0.5rem; font-size: var(--font-size-body-sm); }

.container-details-page.logs-active {
    display: flex;
    overflow: hidden;
    flex-direction: column;
    height: var(--container-details-height, calc(100dvh - 7rem));
    min-height: 0;
}

.logs-active > .detail-breadcrumb,
.logs-active > .detail-header,
.logs-active > .tabs-scroll {
    flex: 0 0 auto;
}

.detail-tabs .detail-tab {
    display: block; cursor: pointer; font: inherit; white-space: nowrap;
    padding: 0.5rem 0.9rem;
    border: 0;
    border-radius: 0.55rem;
    color: var(--secondary-foreground);
    background: transparent;
    transition: color 0.15s ease, background 0.15s ease;
}

.detail-tabs .detail-tab:hover:not(.active) {
    color: var(--link);
    background: var(--hover);
}

.detail-tabs .detail-tab.active {
    color: var(--primary-foreground);
    background: var(--gradient-primary);
    font-weight: var(--font-weight-semibold);
}

.overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.image-card {
    grid-column: span 2;
}

.log-panel {
    overflow: hidden;
    border-radius: 0.75rem;
    background: var(--terminal-background);
}

.logs-active .log-panel:not(.fullscreen) {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
}

.log-toolbar .active {
    color: var(--primary-foreground);
    background: var(--gradient-primary);
}

// The toolbar is a dark island in both themes, so a disabled control keeps a
// readable muted label instead of Bootstrap's transparent button.
.log-toolbar .detail-button:disabled {
    color: var(--muted-foreground);
    background-color: var(--secondary);
    border-color: var(--secondary);
    opacity: 1;
}

.log-body {
    height: clamp(480px, calc(100vh - 270px), 900px);
}

.logs-active .log-panel:not(.fullscreen) .log-body {
    overflow: hidden;
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
}

.container-log-terminal,
.instance-terminal {
    height: 100%;
    margin-bottom: 0 !important;
    border-radius: 0;
}

.instance-terminal {
    min-height: 520px;
}

.log-panel.fullscreen {
    position: fixed;
    z-index: 2000;
    inset: 0;
    border-radius: 0;
}

.log-panel.fullscreen .log-body {
    height: calc(100dvh - 58px);
}

@media (max-width: 767.98px) {
    .detail-header {
        align-items: stretch;
        flex-direction: column;
    }

    .action-bar {
        display: flex;
        width: 100%;
    }

    .action-bar .detail-button {
        flex: 1;
    }

    .overview-grid {
        grid-template-columns: 1fr;
    }

    .image-card {
        grid-column: span 1;
    }

    .log-body {
        height: calc(100dvh - 290px);
        min-height: 360px;
    }

    .log-toolbar .ms-auto {
        margin-left: 0 !important;
    }
}
</style>
