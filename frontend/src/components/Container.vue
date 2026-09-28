<template>
    <div :id="'service-' + encodeURIComponent(name)" class="panel-box mb-[1rem] service-card w-full px-[.75rem] pt-[.55rem] pb-[1.25rem] text-foreground text-base">
        <div class="flex min-h-[28px] flex-nowrap items-center justify-between gap-[.75rem] mb-[.1rem]">
            <h4 class="title-text m-0 min-w-0 flex-[1_1_auto] leading-tight">
                <router-link v-if="serviceStatus.length > 0" class="ui-entity-link" :to="containerDetailsRoute(serviceStatus[0])">
                    <span>{{ name }}</span>
                    <span class="entity-label ms-[.35rem] select-none opacity-50 text-foreground text-xs font-normal lowercase">{{ $t("service") }}</span>
                </router-link>
                <template v-else>
                    <span>{{ name }}</span>
                    <span class="entity-label ms-[.35rem] select-none opacity-50 text-xs font-normal lowercase">{{ $t("service") }}</span>
                </template>
            </h4>
            <ActionGroup
                class="flex-[1_1_140px] min-w-[32px] max-w-[65%] justify-end"
                size="header"
                :actions="serviceActions"
                :max-visible="3"
                :aria-label="$t('serviceActions')"
                @select="onServiceAction"
            />
        </div>
        <div v-if="singleContainer" class="container-subtitle">
            <router-link class="ui-entity-link" :to="containerDetailsRoute(singleContainer)">
                <span>{{ singleContainer.name }}</span>
                <span class="entity-label ms-[.35rem] select-none opacity-50 text-foreground text-xs font-normal lowercase">{{ $t("container", 1) }}</span>
            </router-link>
        </div>

        <div v-if="imageDisplay" class="mb-[.5rem] flex flex-wrap items-baseline gap-x-[.35rem] gap-y-[.25rem] break-all text-foreground text-sm">
            <a v-if="imageUrl" class="tag text-inherit no-underline hover:text-link focus-visible:text-link" :href="imageUrl" :title="imageDisplay" target="_blank" rel="noopener noreferrer">
                {{ imageDisplay }} <span class="entity-label select-none opacity-50 text-foreground text-xs font-normal lowercase">{{ $t("image") }}</span>
            </a>
            <span v-else class="tag" :title="imageDisplay">{{ imageDisplay }} <span class="entity-label select-none opacity-50 text-xs font-normal lowercase">{{ $t("image") }}</span></span>
        </div>
        <div v-if="singleContainer" class="flex flex-wrap items-center gap-x-[.375rem] gap-y-[.35rem]">
            <FloatingTooltip v-if="statusDetail" placement="top">
                <template #trigger="{ triggerAttrs }">
                    <span v-bind="triggerAttrs" class="ui-badge" :class="bgStyle">{{ status }}</span>
                </template>
                <span class="floating-tooltip-detail">{{ statusDetail }}</span>
            </FloatingTooltip>
            <span v-else class="ui-badge" :class="bgStyle">{{ status }}</span>
            <span v-if="exitLabel" class="ui-badge" :class="exitBadgeClass">{{ exitLabel }}</span>
            <a v-for="port in singleContainerPorts" :key="port.display" class="port-link no-underline" :href="port.url" target="_blank">
                <span class="ui-badge ui-badge-neutral">{{ port.display }} {{ $t("port", 1).toLowerCase() }}</span>
            </a>
            <template v-if="dockerStats[singleContainer.name]">
                <span class="text-muted-foreground text-sm">{{ $t("CPU") }}: {{ dockerStats[singleContainer.name].CPUPerc }}</span>
                <span class="text-muted-foreground text-sm">{{ $t("memoryAbbreviated") }}: {{ dockerStats[singleContainer.name].MemUsage }}</span>
            </template>
        </div>
        <div v-else-if="serviceStatus.length === 0" class="flex flex-wrap items-center gap-x-[.375rem] gap-y-[.35rem]">
            <span class="ui-badge ui-badge-neutral">{{ status }}</span>
        </div>
        <ContainerError v-if="singleContainer && errorLabel" class="mt-[.5rem]" :message="errorLabel" />

        <div v-if="serviceStatus.length > 1" class="mt-[1rem] ps-[1rem]">
            <div v-for="instance in serviceStatus" :key="instance.name" class="instance-row">
                <div class="flex min-h-[28px] flex-nowrap items-center justify-between gap-[.75rem] mb-[.25rem]">
                    <div class="instance-name title-text relative m-0 min-w-0 flex-[1_1_auto] leading-tight text-foreground text-sm">
                        <span class="instance-branch" aria-hidden="true">↳</span>
                        <router-link class="ui-entity-link" :to="containerDetailsRoute(instance)">
                            <span>{{ instance.name }}</span>
                            <span class="entity-label ms-[.35rem] select-none opacity-50 text-foreground text-xs font-normal lowercase">{{ $t("container", 1) }}</span>
                        </router-link>
                    </div>
                </div>
                <div class="mt-[.25rem] flex flex-wrap items-center gap-x-[.375rem] gap-y-[.35rem]">
                    <FloatingTooltip v-if="instanceStatusDetail(instance)" placement="top">
                        <template #trigger="{ triggerAttrs }">
                            <span v-bind="triggerAttrs" class="ui-badge" :class="instanceStatusClass(instance)">{{ instance.status }}</span>
                        </template>
                        <span class="floating-tooltip-detail">{{ instanceStatusDetail(instance) }}</span>
                    </FloatingTooltip>
                    <span v-else class="ui-badge" :class="instanceStatusClass(instance)">{{ instance.status }}</span>
                    <span v-if="instanceExitLabel(instance)" class="ui-badge" :class="instanceExitClass(instance)">{{ instanceExitLabel(instance) }}</span>
                    <a v-for="port in instancePorts(instance)" :key="port.display" class="port-link no-underline" :href="port.url" target="_blank">
                        <span class="ui-badge ui-badge-neutral">{{ port.display }} {{ $t("port", 1).toLowerCase() }}</span>
                    </a>
                    <span v-if="dockerStats[instance.name]" class="text-muted-foreground text-sm">
                        {{ $t("CPU") }}: {{ dockerStats[instance.name].CPUPerc }}
                    </span>
                    <span v-if="dockerStats[instance.name]" class="text-muted-foreground text-sm">
                        {{ $t("memoryAbbreviated") }}: {{ dockerStats[instance.name].MemUsage }}
                    </span>
                </div>
                <ContainerError v-if="instanceError(instance)" class="mt-[.25rem]" :message="instanceError(instance)" />
            </div>
        </div>

        <FloatingDialog
            v-model="showActionDialog"
            size="sm"
            :title="$t(actionConfirm.title)"
            :ok-title="$t(actionConfirm.ok)"
            :cancel-title="$t('cancel')"
            :ok-variant="actionConfirm.variant"
            :busy="processing"
            @ok="confirmServiceAction"
            @hidden="clearPendingAction"
        >
            <p class="mb-[.5rem]">{{ $t(actionConfirm.message, { name }) }}</p>
            <div v-if="actionConfirm.commands?.length" class="mt-3">
                <pre class="m-0 overflow-x-auto rounded-[0.35rem] bg-background px-3 py-[0.65rem]"><code v-for="(cmd, i) in actionConfirm.commands" :key="i" class="mt-[0.15rem] first:mt-0 block rounded-none bg-transparent p-0 font-app-mono text-sm leading-[1.45] whitespace-pre text-foreground"><span class="text-[#1a7f37] [.dark_&]:text-[#7ee787]">$</span> {{ cmd }}</code></pre>
            </div>
        </FloatingDialog>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import ActionGroup from "./ActionGroup.vue";
import ContainerError from "./ContainerError.vue";
import { FloatingDialog, FloatingTooltip } from "./floating";
import { containerPublishedPorts, containerStatusTone, containerExitTone, formatContainerExitLabel, formatContainerError } from "../../../common/util-common";
import { imageRegistryUrl } from "../util-frontend";

/**
 * Confirmation copy + compose command for each service control.
 * `command` is a template; `{service}` is replaced with the service name.
 */
const SERVICE_ACTIONS = {
    start: {
        title: "startServiceConfirmTitle",
        message: "startServiceConfirmMsg",
        ok: "startProject",
        variant: "primary",
        command: "docker compose up -d {service}",
        emit: "start-service",
    },
    stop: {
        title: "stopServiceConfirmTitle",
        message: "stopServiceConfirmMsg",
        ok: "stopProject",
        variant: "warning",
        command: "docker compose stop {service}",
        emit: "stop-service",
    },
    restart: {
        title: "restartServiceConfirmTitle",
        message: "restartServiceConfirmMsg",
        ok: "restartProject",
        variant: "primary",
        command: "docker compose restart {service}",
        emit: "restart-service",
    },
};

export default defineComponent({
    components: {
        ActionGroup,
        ContainerError,
        FloatingDialog,
        FloatingTooltip,
    },
    props: {
        name: {
            type: String,
            required: true,
        },
        serviceStatus: {
            type: Array,
            default: () => [],
        },
        dockerStats: {
            type: Object,
            default: () => ({}),
        },
        serviceCount: {
            type: Number,
            default: 1,
        }
    },
    emits: [
        "start-service",
        "stop-service",
        "restart-service"
    ],
    data() {
        return {
            showActionDialog: false,
            pendingAction: null,
        };
    },
    computed: {

        bgStyle() {
            return this.badgeTone(containerStatusTone(this.serviceStatus[0]));
        },

        isRunning() {
            return this.serviceStatus[0]?.state === "running";
        },

        canOpenBash() {
            const instance = this.serviceStatus[0];
            return instance?.state === "running" && instance?.health !== "unhealthy";
        },

        processing() {
            return !!this.$parent?.$parent?.processing;
        },

        /**
         * Service controls for the title ActionGroup.
         * @returns {object[]}
         */
        serviceActions() {
            if (this.isRunning) {
                return [
                    { key: "restart",
                        i18nKey: "restartProject",
                        icon: "rotate",
                        variant: "normal" },
                    { key: "stop",
                        i18nKey: "stopProject",
                        icon: "stop",
                        variant: "warning" },
                    { key: "bash",
                        label: "Bash",
                        icon: "terminal",
                        variant: "normal",
                        hidden: !this.canOpenBash },
                ];
            }

            return [
                { key: "start",
                    i18nKey: "startProject",
                    icon: "play",
                    variant: "primary" },
            ];
        },

        /**
         * Copy + command for the pending service action confirm dialog.
         * @returns {{ title: string, message: string, ok: string, variant: string, commands: string[], emit: string }}
         */
        actionConfirm() {
            const base = SERVICE_ACTIONS[this.pendingAction] ?? SERVICE_ACTIONS.start;
            const command = base.command.replaceAll("{service}", this.name);
            return {
                ...base,
                commands: [ command ],
            };
        },

        terminalRouteLink() {
            if (this.endpoint) {
                return {
                    name: "containerTerminalEndpoint",
                    params: {
                        endpoint: this.endpoint,
                        projectName: this.projectName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            } else {
                return {
                    name: "containerTerminal",
                    params: {
                        projectName: this.projectName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            }
        },

        endpoint() {
            return this.$parent.$parent.endpoint;
        },

        project() {
            return this.$parent.$parent.project;
        },

        projectName() {
            return this.$parent.$parent.project.name;
        },

        envsubstJSONConfig() {
            return this.$parent.$parent.envsubstJSONConfig;
        },

        envsubstService() {
            if (!this.envsubstJSONConfig.services || !this.envsubstJSONConfig.services[this.name]) {
                return {};
            }
            return this.envsubstJSONConfig.services[this.name];
        },

        imageDisplay() {
            return this.envsubstService.image || this.serviceStatus[0]?.image || "";
        },
        imageUrl() {
            return imageRegistryUrl(this.imageDisplay);
        },
        singleContainer() {
            return this.serviceStatus.length === 1 ? this.serviceStatus[0] : null;
        },
        singleContainerPorts() {
            return this.singleContainer ? this.instancePorts(this.singleContainer) : [];
        },
        status() {
            if (this.serviceStatus.length === 0) {
                return "N/A";
            }
            return this.serviceStatus[0].status;
        },
        statusDetail() {
            return this.singleContainer?.statusDetail || this.status;
        },
        exitLabel() {
            return formatContainerExitLabel(this.serviceStatus[0]);
        },
        exitBadgeClass() {
            const tone = containerExitTone(this.serviceStatus[0]);
            return this.badgeTone(tone);
        },
        errorLabel() {
            for (const instance of this.serviceStatus) {
                const error = formatContainerError(instance);
                if (error) {
                    return error;
                }
            }
            return null;
        },
    },
    watch: {
        "$route.hash"() {
            this.scrollToService();
        },
    },
    mounted() {
        this.scrollToService();
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
        scrollToService() {
            if (this.$route.hash === "#service-" + encodeURIComponent(this.name)) {
                this.$nextTick(() => this.$el.scrollIntoView({ block: "nearest" }));
            }
        },
        portHostname() {
            if (this.project.endpoint) {
                return this.project.primaryHostname;
            }
            return this.$root.info.primaryHostname || location.hostname;
        },
        instancePorts(instance) {
            return containerPublishedPorts(instance, this.portHostname());
        },
        onServiceAction(key) {
            if (key === "bash") {
                this.$router.push(this.terminalRouteLink);
                return;
            }
            if (this.processing || !SERVICE_ACTIONS[key]) {
                return;
            }
            this.pendingAction = key;
            this.showActionDialog = true;
        },
        confirmServiceAction() {
            if (this.processing || !this.pendingAction) {
                return;
            }
            const action = SERVICE_ACTIONS[this.pendingAction];
            this.showActionDialog = false;
            if (action) {
                this.$emit(action.emit, this.name);
            }
        },
        clearPendingAction() {
            this.pendingAction = null;
        },
        containerDetailsRoute(instance, tab) {
            const route = {
                name: this.endpoint ? "containerDetailsEndpoint" : "containerDetails",
                params: {
                    projectName: this.projectName,
                    containerName: instance.name,
                },
            };
            if (this.endpoint) {
                route.params.endpoint = this.endpoint;
            }
            if (tab) {
                route.query = { tab };
            }
            return route;
        },
        instanceStatusClass(instance) {
            return this.badgeTone(containerStatusTone(instance));
        },
        instanceStatusDetail(instance) {
            return instance.statusDetail || instance.status;
        },
        instanceExitLabel(instance) {
            return formatContainerExitLabel(instance);
        },
        instanceExitClass(instance) {
            const tone = containerExitTone(instance);
            return this.badgeTone(tone);
        },
        instanceError(instance) {
            return formatContainerError(instance);
        },

    }
});
</script>

<style scoped lang="scss">
.service-card {
    .tag {
        opacity: 1;
    }

    .port-link {
        .ui-badge {
            transition: color 0.15s ease;
        }

        &:hover .ui-badge,
        &:focus-visible .ui-badge {
            color: var(--link);
        }

        &:focus-visible .ui-badge {
            outline: 2px solid var(--ring);
            outline-offset: 2px;
        }
    }

    .entity-label { font-family: var(--font-ui); }

    h4 .entity-label {
        font-size: var(--text-sm-fontSize);
    }

    .container-subtitle {
        margin: -0.1rem 0 0.1rem;
        min-width: 0;
        line-height: var(--line-height-tight);
        color: var(--foreground);
        font-size: var(--text-sm-fontSize);

        .entity-label {
            font-size: var(--text-xs-fontSize);
        }
    }

    .instance-branch {
        position: absolute;
        inset-inline-start: -1rem;
        opacity: 0.5;
        user-select: none;
    }

    .instance-row + .instance-row {
        padding-top: 0.65rem;
    }

}
</style>
