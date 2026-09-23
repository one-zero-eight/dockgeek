<template>
    <div :id="'service-' + encodeURIComponent(name)" class="shadow-box mb-3 service-card">
        <div class="title-row">
            <h4 class="title-text">
                <router-link v-if="serviceStatus.length > 0" class="title-link" :to="containerDetailsRoute(serviceStatus[0])">
                    <span>{{ name }}</span>
                </router-link>
                <span v-else>{{ name }}</span>
                <span class="entity-label">{{ $t("service") }}</span>
            </h4>
            <ActionGroup
                class="title-actions"
                size="sm"
                :actions="serviceActions"
                :max-visible="3"
                :aria-label="$t('serviceActions')"
                @select="onServiceAction"
            />
        </div>
        <div v-if="singleContainer" class="container-subtitle">
            <router-link class="title-link" :to="containerDetailsRoute(singleContainer)">
                <span>{{ singleContainer.name }}</span>
            </router-link>
            <span class="entity-label">{{ $tc("container", 1) }}</span>
        </div>

        <div v-if="imageDisplay" class="image mb-2">
            <span class="tag" :title="imageDisplay">{{ imageDisplay }}</span>
            <span class="entity-label">{{ $t("image") }}</span>
        </div>
        <div v-if="singleContainer" class="service-meta">
            <FloatingTooltip v-if="statusDetail" placement="top">
                <template #trigger="{ triggerAttrs }">
                    <span v-bind="triggerAttrs" class="badge me-1" :class="bgStyle">{{ status }}</span>
                </template>
                <span class="floating-tooltip-detail">{{ statusDetail }}</span>
            </FloatingTooltip>
            <span v-else class="badge me-1" :class="bgStyle">{{ status }}</span>
            <span v-if="exitLabel" class="badge me-1" :class="exitBadgeClass">{{ exitLabel }}</span>
            <a v-for="port in singleContainerPorts" :key="port.display" class="port-link" :href="port.url" target="_blank">
                <span class="badge bg-secondary">{{ port.display }} {{ $tc("port", 1).toLowerCase() }}</span>
            </a>
            <template v-if="dockerStats[singleContainer.name]">
                <span class="stats">{{ $t("CPU") }}: {{ dockerStats[singleContainer.name].CPUPerc }}</span>
                <span class="stats">{{ $t("memoryAbbreviated") }}: {{ dockerStats[singleContainer.name].MemUsage }}</span>
            </template>
        </div>
        <div v-else-if="serviceStatus.length === 0" class="service-meta">
            <span class="badge me-1 bg-secondary">{{ status }}</span>
        </div>
        <ContainerError v-if="singleContainer && errorLabel" class="mt-2" :message="errorLabel" />

        <div v-if="serviceStatus.length > 1" class="container-instances mt-3">
            <div v-for="instance in serviceStatus" :key="instance.name" class="instance-row">
                <div class="title-row">
                    <div class="instance-name title-text">
                        <span class="instance-branch" aria-hidden="true">↳</span>
                        <router-link class="title-link" :to="containerDetailsRoute(instance)">
                            <span>{{ instance.name }}</span>
                        </router-link>
                        <span class="entity-label">{{ $tc("container", 1) }}</span>
                    </div>
                </div>
                <div class="instance-meta">
                    <FloatingTooltip v-if="instanceStatusDetail(instance)" placement="top">
                        <template #trigger="{ triggerAttrs }">
                            <span v-bind="triggerAttrs" class="badge" :class="instanceStatusClass(instance)">{{ instance.status }}</span>
                        </template>
                        <span class="floating-tooltip-detail">{{ instanceStatusDetail(instance) }}</span>
                    </FloatingTooltip>
                    <span v-else class="badge" :class="instanceStatusClass(instance)">{{ instance.status }}</span>
                    <span v-if="instanceExitLabel(instance)" class="badge" :class="instanceExitClass(instance)">{{ instanceExitLabel(instance) }}</span>
                    <a v-for="port in instancePorts(instance)" :key="port.display" class="port-link" :href="port.url" target="_blank">
                        <span class="badge bg-secondary">{{ port.display }} {{ $tc("port", 1).toLowerCase() }}</span>
                    </a>
                    <span v-if="dockerStats[instance.name]" class="stats">
                        {{ $t("CPU") }}: {{ dockerStats[instance.name].CPUPerc }}
                    </span>
                    <span v-if="dockerStats[instance.name]" class="stats">
                        {{ $t("memoryAbbreviated") }}: {{ dockerStats[instance.name].MemUsage }}
                    </span>
                </div>
                <ContainerError v-if="instanceError(instance)" class="mt-1" :message="instanceError(instance)" />
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
            <p class="mb-2">{{ $t(actionConfirm.message, { name }) }}</p>
            <div v-if="actionConfirm.commands?.length" class="action-commands">
                <pre><code v-for="(cmd, i) in actionConfirm.commands" :key="i"><span class="action-command-prompt">$</span> {{ cmd }}</code></pre>
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

/**
 * Confirmation copy + compose command for each service control.
 * `command` is a template; `{service}` is replaced with the service name.
 */
const SERVICE_ACTIONS = {
    start: {
        title: "startServiceConfirmTitle",
        message: "startServiceConfirmMsg",
        ok: "startStack",
        variant: "btn-primary",
        command: "docker compose up -d {service}",
        emit: "start-service",
    },
    stop: {
        title: "stopServiceConfirmTitle",
        message: "stopServiceConfirmMsg",
        ok: "stopStack",
        variant: "btn-warning",
        command: "docker compose stop {service}",
        emit: "stop-service",
    },
    restart: {
        title: "restartServiceConfirmTitle",
        message: "restartServiceConfirmMsg",
        ok: "restartStack",
        variant: "btn-primary",
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
            return `bg-${containerStatusTone(this.serviceStatus[0])}`;
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
                        i18nKey: "restartStack",
                        icon: "rotate",
                        variant: "btn-normal" },
                    { key: "stop",
                        i18nKey: "stopStack",
                        icon: "stop",
                        variant: "btn-warning" },
                    { key: "bash",
                        label: "Bash",
                        icon: "terminal",
                        variant: "btn-normal",
                        hidden: !this.canOpenBash },
                ];
            }

            return [
                { key: "start",
                    i18nKey: "startStack",
                    icon: "play",
                    variant: "btn-primary" },
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
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            } else {
                return {
                    name: "containerTerminal",
                    params: {
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            }
        },

        endpoint() {
            return this.$parent.$parent.endpoint;
        },

        stack() {
            return this.$parent.$parent.stack;
        },

        stackName() {
            return this.$parent.$parent.stack.name;
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
            return tone ? `bg-${tone}` : "bg-secondary";
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
        scrollToService() {
            if (this.$route.hash === "#service-" + encodeURIComponent(this.name)) {
                this.$nextTick(() => this.$el.scrollIntoView({ block: "nearest" }));
            }
        },
        portHostname() {
            if (this.stack.endpoint) {
                return this.stack.primaryHostname;
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
                    stackName: this.stackName,
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
            return `bg-${containerStatusTone(instance)}`;
        },
        instanceStatusDetail(instance) {
            return instance.statusDetail || instance.status;
        },
        instanceExitLabel(instance) {
            return formatContainerExitLabel(instance);
        },
        instanceExitClass(instance) {
            const tone = containerExitTone(instance);
            return tone ? `bg-${tone}` : "bg-secondary";
        },
        instanceError(instance) {
            return formatContainerError(instance);
        },

    }
});
</script>

<style scoped lang="scss">
@import "../styles/vars";

.service-card {
    width: 100%;
    // Match editor-box toolbar padding so the service title sits on the
    // same line as `compose.yaml`.
    padding: 0.55rem 0.75rem 1.25rem;

    .title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        min-height: 28px;
        margin-bottom: 0.25rem;
        flex-wrap: nowrap;
    }

    .title-text {
        margin: 0;
        min-width: 0;
        flex: 1 1 auto;
        line-height: 1.25;
    }

    h4.title-text {
        font-size: 1.25rem;
    }

    .title-link {
        color: inherit;
        text-decoration: none;
        overflow-wrap: anywhere;
        border-radius: 0.2rem;
        transition: color 0.15s ease;

        &:hover,
        &:focus-visible {
            color: $primary;
            text-decoration: none;
        }

        &:focus-visible {
            outline: 2px solid currentColor;
            outline-offset: 3px;
        }
    }

    .title-actions {
        flex: 1 1 140px;
        min-width: 38px;
        max-width: 65%;
        justify-content: flex-end;
    }

    .image {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.25rem;
        word-break: break-all;
        font-size: 0.9rem;
        color: var(--bs-heading-color);

        .tag {
            opacity: 0.5;
        }
    }

    .service-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem 0.5rem;
        align-items: center;
    }

    .port-link {
        text-decoration: none;

        &:hover .badge,
        &:focus-visible .badge {
            filter: brightness(1.1);
        }
    }

    .stats {
        font-size: 0.8rem;
        color: $dark-font-color3;
    }

    .entity-label {
        margin-inline-start: 0.35rem;
        font-family: var(--bs-body-font-family);
        font-size: 0.75rem;
        font-weight: normal;
        text-transform: lowercase;
        opacity: 0.5;
        user-select: none;
    }

    h4 .entity-label {
        font-size: 0.875rem;
    }

    .container-subtitle {
        margin: -0.1rem 0 0.35rem;
        min-width: 0;
        line-height: 1.25;
        color: var(--bs-heading-color);
        font-size: 0.9rem;

        .entity-label {
            font-size: 0.75rem;
        }
    }

    .container-instances {
        padding-inline-start: 1rem;
    }

    .instance-name {
        position: relative;
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

    .instance-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem 0.5rem;
        align-items: center;
        margin-top: 0.25rem;
    }

    .instance-row .instance-name {
        color: var(--bs-heading-color);
        font-size: 0.9rem;
    }
}

.action-commands {
    margin-top: 0.75rem;

    pre {
        margin: 0;
        padding: 0.65rem 0.75rem;
        border-radius: 0.35rem;
        background: rgba(0, 0, 0, 0.28);
        overflow-x: auto;
    }

    code {
        display: block;
        padding: 0;
        color: $dark-font-color;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 0.8rem;
        line-height: 1.45;
        white-space: pre;
        background: transparent;
    }

    code + code {
        margin-top: 0.15rem;
    }

    .action-command-prompt {
        color: #7ee787;
    }
}
</style>
