<template>
    <transition name="slide-fade" appear>
        <div
            class="container-details-page"
            :class="{ 'logs-active': isDesktop || activeTab === 'logs' }"
            :style="containerDetailsStyle"
        >
            <div class="detail-header mb-0">
                <div class="detail-heading min-w-0">
                    <h1 id="container-details-title" class="detail-title mb-0">
                        <span v-if="container" class="status-dot inline-block w-3 h-3 rounded-full align-[0.12em]" :class="`tone-${containerStatusTone(container)}`" aria-hidden="true" /> <span>{{ containerName }}</span>
                        <span class="entity-label opacity-50 select-none">{{ $t("container", 1).toLowerCase() }}</span>
                    </h1>
                    <div v-if="container" class="detail-summary flex flex-wrap items-center gap-x-[.375rem] gap-y-[.35rem]">
                        <router-link :to="stackRoute" class="ui-entity-link text-sm">
                            {{ stackName }} <span class="select-none opacity-50 text-foreground text-xs font-normal lowercase">{{ $t("project") }}</span>
                        </router-link>
                        <template v-if="serviceName">
                            <span class="text-muted-foreground text-sm">/</span>
                            <span class="text-foreground text-sm">{{ serviceName }} <span class="select-none opacity-50 text-xs font-normal lowercase">{{ $t("service") }}</span></span>
                        </template>
                        <ContainerError v-if="errorLabel" class="w-full" :message="errorLabel" />
                    </div>
                </div>
                <div v-if="container" class="detail-actions">
                    <button v-if="isDesktop" class="ui-btn ui-btn-sm whitespace-nowrap" @click="terminalOpen = true">
                        <font-awesome-icon icon="terminal" class="me-[.25rem]" /> {{ $t("terminal") }}
                    </button>
                    <ActionGroup
                        size="header"
                        :actions="containerActions"
                        :disabled="processing"
                        :max-visible="3"
                        :aria-label="$t('container', 1)"
                        @select="performAction"
                    />
                </div>
            </div>

            <div v-if="!loaded" class="panel-box big-padding">{{ $t("loadingContainer") }}</div>
            <div v-else-if="!container" class="panel-box big-padding empty-state text-muted-foreground">
                <h4>{{ $t("containerNotFound") }}</h4>
                <p class="mb-[1rem]">{{ $t("containerNotFoundDescription") }}</p>
                <router-link class="ui-btn ui-btn-primary" :to="stackRoute">{{ $t("backToStack") }}</router-link>
            </div>

            <template v-else>
                <div v-if="!isDesktop" class="tabs-scroll mb-[1rem] overflow-x-auto">
                    <ul class="detail-tabs flex flex-nowrap list-none m-0 gap-[0.15rem] w-full p-1 rounded-lg bg-card" role="tablist" aria-labelledby="container-details-title" @keydown="onTabKeydown">
                        <li v-for="tab in tabs" :key="tab" class="min-w-0 flex-1">
                            <button
                                :id="`container-tab-${tab}`"
                                :ref="`tab-${tab}`"
                                class="detail-tab w-full min-h-[38px] rounded-lg bg-transparent px-3 py-[.35rem] text-secondary-foreground text-sm font-medium cursor-pointer whitespace-nowrap"
                                :class="{ active: activeTab === tab }"
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

                <h2 v-if="isDesktop" id="container-overview-heading" class="section-heading">{{ $t("overview") }}</h2>
                <section v-if="isDesktop || activeTab === 'overview'" id="container-panel-overview" class="overview-grid panel-box grid gap-4 p-3" :role="isDesktop ? undefined : 'tabpanel'" :aria-labelledby="isDesktop ? 'container-overview-heading' : 'container-tab-overview'" :tabindex="isDesktop ? undefined : 0">
                    <article v-for="item in overviewItems" :key="item.key" class="min-w-0" :class="{ 'image-card': item.wide }">
                        <div class="mb-1 text-muted-foreground text-sm">{{ item.label }}</div>
                        <div v-if="item.key === 'status'" class="flex flex-wrap items-center gap-x-[.375rem] gap-y-[.15rem]">
                            <span class="ui-badge" :class="statusClass">{{ item.value }}</span>
                            <span v-if="exitLabel" class="ui-badge" :class="exitBadgeClass">{{ exitLabel }}</span>
                            <span v-if="item.detail" class="text-foreground text-sm">{{ item.detail }}</span>
                        </div>
                        <div v-else-if="item.key === 'image' && imageUrl" class="break-words text-base">
                            <a class="ui-entity-link" :href="imageUrl" target="_blank" rel="noopener noreferrer">{{ item.value }}</a>
                        </div>
                        <div v-else class="text-foreground text-base" :class="{ 'break-words': item.breakWords }">{{ item.value }}</div>
                    </article>
                </section>

                <h2 v-if="isDesktop" id="container-logs-heading" class="section-heading logs-heading">{{ $t("logs") }}</h2>
                <section v-if="isDesktop || activeTab === 'logs'" id="container-panel-logs" class="log-panel" :class="{ fullscreen: logFullscreen }" :role="isDesktop ? undefined : 'tabpanel'" :aria-labelledby="isDesktop ? 'container-logs-heading' : 'container-tab-logs'" :tabindex="isDesktop ? undefined : 0">
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

                <section v-if="!isDesktop && activeTab === 'terminal'" id="container-panel-terminal" role="tabpanel" aria-labelledby="container-tab-terminal" tabindex="0">
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
            <FloatingDialog v-if="isDesktop" v-model="terminalOpen" :title="$t('terminal')" size="xl" fill hide-footer dialog-class="container-terminal-dialog">
                <div v-if="!isRunning" class="panel-box big-padding empty-state text-muted-foreground">
                    {{ $t("terminalRequiresRunningContainer") }}
                </div>
                <template v-else>
                    <div class="flex items-center gap-2 mb-[1rem]">
                        <span>{{ $t("shell") }}:</span>
                        <div class="flex" role="group" :aria-label="$t('shell')">
                            <button class="ui-btn ui-btn-sm" :class="{ 'ui-btn-primary': shell === 'bash' }" @click="shell = 'bash'">bash</button>
                            <button class="ui-btn ui-btn-sm" :class="{ 'ui-btn-primary': shell === 'sh' }" @click="shell = 'sh'">sh</button>
                        </div>
                    </div>
                    <Terminal
                        v-if="terminalOpen"
                        :key="shell"
                        class="dialog-terminal terminal"
                        :name="instanceTerminalName"
                        :endpoint="endpoint"
                        :stack-name="stackName"
                        :container-name="containerName"
                        :shell="shell"
                        mode="interactiveContainer"
                    />
                </template>
            </FloatingDialog>
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
import ActionGroup from "../components/ActionGroup.vue";
import ContainerError from "../components/ContainerError.vue";
import FloatingDialog from "../components/floating/FloatingDialog.vue";
import { imageRegistryUrl } from "../util-frontend";

export default {
    components: {
        ActionGroup,
        ContainerError,
        FloatingDialog,
    },
    data() {
        return {
            activeTab: "overview",
            isDesktop: window.matchMedia("(min-width: 768px)").matches,
            terminalOpen: false,
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
            containerStatusTone,
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
        imageUrl() {
            return imageRegistryUrl(this.container?.image || "");
        },
        isRunning() {
            return this.container?.state === "running";
        },
        containerActions() {
            return this.isRunning
                ? [
                    { key: "restartContainer",
                        icon: "rotate",
                        i18nKey: "restartStack",
                        variant: "normal" },
                    { key: "stopContainer",
                        icon: "stop",
                        i18nKey: "stopStack",
                        variant: "warning" },
                ]
                : [{ key: "startContainer",
                    icon: "play",
                    i18nKey: "startStack",
                    variant: "primary" }];
        },
        overviewItems() {
            const unavailable = this.$t("notAvailableShort");
            return [
                { key: "status",
                    label: this.$t("status"),
                    value: this.container.status || unavailable,
                    detail: this.container.statusDetail },
                { key: "health",
                    label: this.$t("health"),
                    value: this.container.health || unavailable },
                { key: "image",
                    label: this.$t("dockerImage"),
                    value: this.container.image || unavailable,
                    wide: true,
                    breakWords: true },
                { key: "ports",
                    label: this.$t("port", 2),
                    value: this.container.ports || unavailable,
                    breakWords: true },
                { key: "created",
                    label: this.$t("createdAt"),
                    value: this.formatCreatedAt(this.container.createdAt) },
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
        this.desktopMediaQuery = window.matchMedia("(min-width: 768px)");
        this.desktopMediaQuery.addEventListener("change", this.onViewportChange);
        this.updateAvailableHeight();
        window.addEventListener("resize", this.updateAvailableHeight);
        this.refresh();
        this.pollInterval = window.setInterval(this.refresh, 5000);
    },
    unmounted() {
        window.clearInterval(this.pollInterval);
        window.removeEventListener("resize", this.updateAvailableHeight);
        this.desktopMediaQuery.removeEventListener("change", this.onViewportChange);
        this.leaveLogs();
    },
    methods: {
        formatCreatedAt(value) {
            const date = new Date(value);
            if (!value || Number.isNaN(date.getTime())) {
                return this.$t("notAvailableShort");
            }
            const elapsed = Math.max(0, (Date.now() - date.getTime()) / 1000);
            const units = [[ "year", 31536000 ], [ "month", 2592000 ], [ "day", 86400 ], [ "hour", 3600 ], [ "minute", 60 ], [ "second", 1 ]];
            const [ unit, seconds ] = units.find(([ , threshold ]) => elapsed >= threshold) || units[units.length - 1];
            const relative = new Intl.RelativeTimeFormat(this.$i18n.locale, { numeric: "always" }).format(-Math.floor(elapsed / seconds), unit);
            const formatted = new Intl.DateTimeFormat(this.$i18n.locale, { dateStyle: "medium",
                timeStyle: "short" }).format(date);
            return `${formatted} (${relative})`;
        },
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
            if (this.activeTab === "logs" && tab !== "logs" && !this.isDesktop) {
                this.leaveLogs();
                this.logFullscreen = false;
            }
            this.activeTab = tab;
            this.$nextTick(this.updateAvailableHeight);
        },
        onViewportChange(event) {
            this.isDesktop = event.matches;
            this.terminalOpen = false;
            if (!this.isDesktop && this.activeTab !== "logs") {
                this.leaveLogs();
                this.logFullscreen = false;
            }
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
            if (this.isDesktop || this.activeTab === "logs") {
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
.status-dot.tone-primary { background: var(--primary); }
.status-dot.tone-warning,
.status-dot.tone-stopped { background: var(--warning); }
.status-dot.tone-danger { background: var(--destructive); }
.status-dot.tone-secondary { background: var(--muted); }

.detail-header {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem 1rem;
}

.detail-heading {
    flex: 0 1 auto;
}

.detail-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.detail-summary {
    margin-top: -0.375rem;
    margin-bottom: 0.125rem;
}

.entity-label {
    margin-inline-start: 0.35rem;
    font-size: 1.25rem;
    font-weight: var(--fontWeight-normal);
}

.detail-actions {
    display: flex;
    flex: 1 0 38px;
    min-width: 38px;
    margin-top: 4px;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
}

.section-heading {
    flex: 0 0 auto;
    margin: 0.75rem 0 0.5rem;
    font-size: 1rem;
    font-weight: 600;
}

.logs-heading {
    margin-top: 1rem;
}

.detail-tab {
    transition: color 0.15s ease, background 0.15s ease;

    &:hover:not(.active) { background: var(--hover); }
    &.active { color: var(--primary); background: var(--selected); }
    &:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
}

.container-details-page.logs-active {
    display: flex;
    overflow: hidden;
    flex-direction: column;
    height: var(--container-details-height, calc(100dvh - 7rem));
    min-height: 0;
}

.logs-active > .detail-header,
.logs-active > .tabs-scroll,
.logs-active > .overview-grid {
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

.log-toolbar .ui-btn {
    flex: 0 0 auto;
}

.log-toolbar .active {
    color: var(--secondary-foreground);
    background: var(--secondary-hover);
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

.dialog-terminal {
    height: calc(100dvh - 170px);
    min-height: 0;
}

@media (max-width: 767.98px) {
    .detail-actions {
        flex-basis: 32px;
        min-width: 32px;
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
