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
                        <h1 id="container-details-title" class="mb-0 me-1">{{ containerName }}</h1>
                        <FloatingTooltip v-if="container && statusDetail" placement="top">
                            <template #trigger="{ triggerAttrs }">
                                <span v-bind="triggerAttrs" class="ui-badge" :class="statusClass">{{ container.status }}</span>
                            </template>
                            <span class="floating-tooltip-detail">{{ statusDetail }}</span>
                        </FloatingTooltip>
                        <span v-else-if="container" class="ui-badge" :class="statusClass">{{ container.status }}</span>
                        <span v-if="exitLabel" class="ui-badge" :class="exitBadgeClass">{{ exitLabel }}</span>
                    </div>
                    <div v-if="errorLabel" class="mt-[.5rem]">
                        <ContainerError :message="errorLabel" />
                    </div>
                    <div v-if="serviceName" class="service-name mt-[.25rem] text-foreground">{{ $t("service") }}: {{ serviceName }}</div>
                </div>

                <div v-if="container" class="action-bar flex" role="group">
                    <button
                        v-for="action in containerActions"
                        :key="action.event"
                        class="ui-btn"
                        :class="{ 'ui-btn-primary': action.primary }"
                        :disabled="processing"
                        @click="performAction(action.event)"
                    >
                        <font-awesome-icon :icon="action.icon" class="me-[.25rem]" /> {{ $t(action.label) }}
                    </button>
                </div>
            </div>

            <div v-if="!loaded" class="panel-box big-padding">{{ $t("loadingContainer") }}</div>
            <div v-else-if="!container" class="panel-box big-padding empty-state text-muted-foreground">
                <h4>{{ $t("containerNotFound") }}</h4>
                <p class="mb-[1rem]">{{ $t("containerNotFoundDescription") }}</p>
                <router-link class="ui-btn ui-btn-primary" :to="stackRoute">{{ $t("backToStack") }}</router-link>
            </div>

            <template v-else>
                <div class="tabs-scroll mb-[1rem] overflow-x-auto">
                    <ul class="flex flex-nowrap list-none m-0 gap-1 min-w-max p-1 rounded-xl border border-border bg-background" role="tablist" aria-labelledby="container-details-title" @keydown="onTabKeydown">
                        <li v-for="tab in tabs" :key="tab">
                            <button
                                :id="`container-tab-${tab}`"
                                :ref="`tab-${tab}`"
                                class="ui-detail-tab"
                                :class="{ 'ui-detail-tab-active': activeTab === tab }"
                                role="tab"
                                :aria-selected="activeTab === tab"
                                :aria-controls="`container-panel-${tab}`"
                                :tabindex="activeTab === tab ? 0 : -1"
                                @click="setTab(tab)"
                            >
                                {{ $t(tab) }}
                            </button>
                        </li>
                    </ul>
                </div>

                <section v-if="activeTab === 'overview'" id="container-panel-overview" class="overview-grid grid gap-4" role="tabpanel" aria-labelledby="container-tab-overview" tabindex="0">
                    <article v-for="item in overviewItems" :key="item.key" class="ui-detail-card" :class="{ 'image-card': item.wide }">
                        <div class="ui-detail-label">{{ item.label }}</div>
                        <div class="ui-detail-value" :class="{ 'break-words': item.breakWords }">{{ item.value }}</div>
                    </article>
                </section>

                <section v-if="activeTab === 'logs'" id="container-panel-logs" class="log-panel" :class="{ fullscreen: logFullscreen }" role="tabpanel" aria-labelledby="container-tab-logs" tabindex="0">
                    <div class="log-toolbar flex flex-none flex-wrap gap-2 p-[0.65rem] bg-terminal-bar">
                        <button class="ui-btn ui-btn-sm" :class="{ active: followLogs }" @click="toggleFollow">
                            <font-awesome-icon :icon="followLogs ? 'pause' : 'play'" class="me-[.25rem]" />
                            {{ followLogs ? $t("pauseFollow") : $t("resumeFollow") }}
                        </button>
                        <button class="ui-btn ui-btn-sm" @click="clearLogs">
                            <font-awesome-icon icon="trash" class="me-[.25rem]" /> {{ $t("clearDisplay") }}
                        </button>
                        <button class="ui-btn ui-btn-sm" :disabled="!hasLogSelection" @click="copyLogs">
                            <font-awesome-icon icon="copy" class="me-[.25rem]" /> {{ $t("copySelection") }}
                        </button>
                        <button class="ui-btn ui-btn-sm ms-auto" @click="toggleFullscreen">
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

                <section v-if="activeTab === 'terminal'" id="container-panel-terminal" role="tabpanel" aria-labelledby="container-tab-terminal" tabindex="0">
                    <div v-if="!isRunning" class="panel-box big-padding empty-state text-muted-foreground">
                        {{ $t("terminalRequiresRunningContainer") }}
                    </div>
                    <template v-else>
                        <div class="flex items-center gap-2 mb-[1rem]">
                            <span>{{ $t("shell") }}:</span>
                            <div class="flex" role="group">
                                <button class="ui-btn ui-btn-sm" :class="{ 'ui-btn-primary': shell === 'bash' }" @click="shell = 'bash'">bash</button>
                                <button class="ui-btn ui-btn-sm" :class="{ 'ui-btn-primary': shell === 'sh' }" @click="shell = 'sh'">sh</button>
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
            tabs: [ "overview", "logs", "terminal" ],
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
        containerActions() {
            return this.isRunning
                ? [
                    { event: "restartContainer",
                        icon: "rotate",
                        label: "restartStack" },
                    { event: "stopContainer",
                        icon: "stop",
                        label: "stopStack" },
                ]
                : [{ event: "startContainer",
                    icon: "play",
                    label: "startStack",
                    primary: true }];
        },
        overviewItems() {
            const unavailable = this.$t("notAvailableShort");
            return [
                { key: "status",
                    label: this.$t("status"),
                    value: this.container.state || this.container.status },
                { key: "health",
                    label: this.$t("health"),
                    value: this.container.health || unavailable },
                { key: "image",
                    label: this.$t("dockerImage"),
                    value: this.container.image || unavailable,
                    wide: true,
                    breakWords: true },
                { key: "ports",
                    label: this.$tc("port", 2),
                    value: this.container.ports || unavailable,
                    breakWords: true },
                { key: "created",
                    label: this.$t("createdAt"),
                    value: this.container.createdAt || unavailable },
                { key: "running",
                    label: this.$t("runningFor"),
                    value: this.container.runningFor || unavailable },
                { key: "cpu",
                    label: this.$t("CPU"),
                    value: this.containerStats?.CPUPerc || unavailable },
                { key: "memory",
                    label: this.$t("memory"),
                    value: this.containerStats?.MemUsage || unavailable },
            ];
        },
        statusClass() {
            return this.badgeTone(containerStatusTone(this.container));
        },
        statusDetail() {
            return this.container?.statusDetail || this.container?.status;
        },
        exitLabel() {
            return formatContainerExitLabel(this.container);
        },
        exitBadgeClass() {
            const tone = containerExitTone(this.container);
            return this.badgeTone(tone);
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
        badgeTone(tone) {
            return {
                primary: "ui-badge-primary",
                danger: "ui-badge-danger",
                stopped: "ui-badge-warning",
                secondary: "ui-badge-neutral",
            }[tone] || "ui-badge-neutral";
        },
        onTabKeydown(event) {
            if (![ "ArrowLeft", "ArrowRight", "Home", "End" ].includes(event.key)) {
                return;
            }
            event.preventDefault();
            const index = this.tabs.indexOf(this.activeTab);
            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? this.tabs.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + this.tabs.length) % this.tabs.length;
            const nextTab = this.tabs[nextIndex];
            this.setTab(nextTab);
            this.$nextTick(() => this.$refs[`tab-${nextTab}`]?.[0]?.focus());
        },
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
.log-toolbar .ui-btn:disabled {
    color: var(--muted-foreground);
    background-color: var(--secondary);
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

    .action-bar .ui-btn {
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
