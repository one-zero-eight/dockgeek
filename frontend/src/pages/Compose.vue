<template>
    <transition name="slide-fade" appear>
        <div
            class="compose-page"
            :class="{ 'stack-view-mode': !isAdd && !isEditMode && stack.isManagedByDockge, 'full-page-editor': isFullPageEditor }"
        >
            <div v-if="!isAdd" class="project-header mb-[1rem]">
                <h1 class="project-title mb-0">
                    <FloatingTooltip placement="top-start">
                        <template #trigger="{ triggerAttrs }">
                            <span
                                v-bind="triggerAttrs"
                                class="project-status-dot inline-block w-3 h-3 rounded-full align-[0.12em]"
                                :class="`tone-${statusColor(globalStack?.status)}`"
                                role="img"
                                :aria-label="$t(projectStatus.title)"
                            />
                        </template>
                        <span class="floating-tooltip-title">{{ $t(projectStatus.title) }}</span>
                        <span class="floating-tooltip-detail">{{ projectStatus.detail }}</span>
                    </FloatingTooltip> <span>{{ stack.name }}</span>
                    <span class="stack-label opacity-50 select-none">{{ $t("project") }}</span>
                    <span v-if="$root.agentCount > 1 && endpoint !== ''" class="agent-name text-muted-foreground text-sm">
                        ({{ endpointDisplay }})
                    </span>
                </h1>

                <ActionGroup
                    v-if="stack.isManagedByDockge && !isFullPageEditor"
                    class="stack-actions"
                    :actions="projectActions"
                    :disabled="processing"
                    :max-visible="3"
                    size="header"
                    :aria-label="$t('projectActions')"
                    @select="requestProjectAction"
                />
            </div>

            <!-- URLs -->
            <div v-if="urls.length > 0" class="mb-[1rem]">
                <a v-for="(urlItem, index) in urls" :key="index" target="_blank" :href="urlItem.url">
                    <span class="ui-badge ui-badge-neutral me-[.5rem]">{{ urlItem.display }}</span>
                </a>
            </div>

            <div v-if="$root.isCompact && stack.isManagedByDockge && !isFullPageEditor" class="compact-compose-tabs mb-[1rem] flex w-full items-center gap-[0.15rem] rounded-lg bg-card p-1" role="tablist">
                <button class="compact-tab" :class="{ active: compactTab === 'containers' }" type="button" role="tab" :aria-selected="compactTab === 'containers'" @click="compactTab = 'containers'">{{ $t("services") }}</button>
                <button class="compact-tab" :class="{ active: compactTab === 'compose' }" type="button" role="tab" :aria-selected="compactTab === 'compose'" @click="compactTab = 'compose'">Compose</button>
            </div>

            <!-- New project general fields -->
            <div v-if="isAdd" class="panel-box big-padding mb-[1rem]">
                <label for="name" class="stack-name-label inline-block mb-2">{{ $t("stackFolder") }}</label>
                <div class="stack-folder-picker">
                    <FloatingMenu
                        placement="bottom-start"
                        :offset="4"
                        :match-trigger-width="true"
                        panel-class="stack-path-menu"
                    >
                        <template #trigger="{ triggerAttrs, isOpen }">
                            <button
                                v-bind="triggerAttrs"
                                id="endpoint"
                                type="button"
                                class="stack-path-full"
                                :class="{ open: isOpen }"
                                :title="stacksDirectoryPath"
                                :aria-label="$t('dockgeAgent')"
                            >
                                <span class="stack-path-text">
                                    <span class="stack-path-dir">{{ stacksDirectoryPath.replace(/\/+$/, "") }}/</span><span class="stack-path-name" :class="{ 'is-placeholder': !stack.name }">{{ stack.name || $t("stackFolderPlaceholder") }}</span>
                                </span>
                                <font-awesome-icon icon="chevron-down" class="stack-path-caret" />
                            </button>
                        </template>

                        <button
                            v-for="opt in agentPathOptions"
                            :key="opt.endpoint === '' ? 'current' : opt.endpoint"
                            type="button"
                            role="menuitem"
                            class="floating-menu-item stack-path-option"
                            :class="{ active: (stack.endpoint || '') === (opt.endpoint || '') }"
                            :disabled="opt.offline"
                            @click="selectAgentPath(opt.endpoint)"
                        >
                            <span class="stack-path-option-line">
                                <span class="stack-path-option-dir">{{ opt.path }}/</span><span class="stack-path-option-name" :class="{ 'is-placeholder': !stack.name }">{{ stack.name || $t("stackFolderPlaceholder") }}</span>
                            </span>
                            <span v-if="opt.agentLabel" class="stack-path-option-agent">{{ opt.agentLabel }}</span>
                        </button>
                    </FloatingMenu>
                    <input
                        id="name"
                        v-model="stack.name"
                        type="text"
                        class="ui-field placeholder:opacity-50"
                        required
                        spellcheck="false"
                        autocomplete="off"
                        :placeholder="$t('stackFolderPlaceholder')"
                        @input="normalizeStackFolderName"
                        @blur="finalizeStackFolderName"
                    >
                </div>
                <div class="stack-name-help mt-1 text-muted-foreground text-sm">{{ $t("stackFolderHint") }}</div>
            </div>

            <div v-if="stack.isManagedByDockge" class="stack-content -mx-3 flex flex-wrap">
                <div v-if="!isFullPageEditor" v-show="!$root.isCompact || compactTab === 'containers'" class="containers-column w-full px-3 min-[992px]:w-1/2 min-[992px]:flex-none">
                    <div ref="containerList" class="container-list">
                        <Container
                            v-for="name in displayServiceNames"
                            :key="name"
                            :name="name"
                            :serviceStatus="serviceStatusList[name]"
                            :dockerStats="dockerStats"
                            :service-count="displayServiceNames.length"
                            @start-service="startService"
                            @stop-service="stopService"
                            @restart-service="restartService"
                        />
                    </div>
                </div>
                <div v-show="isFullPageEditor || !$root.isCompact || compactTab !== 'containers'" class="compose-column px-3" :class="isFullPageEditor ? 'w-full' : 'w-full min-[992px]:w-1/2 min-[992px]:flex-none'">
                    <!-- YAML editor -->
                    <div v-show="isFullPageEditor || !$root.isCompact || compactTab === 'compose'" class="panel-box mb-[1rem] editor-box" :class="{'edit-mode' : isEditMode}">
                        <div class="editor-toolbar">
                            <span class="editor-filename">{{ stack.composeFileName || "compose.yaml" }}</span>
                            <button
                                v-if="!isFullPageEditor && stack.isManagedByDockge"
                                type="button"
                                class="editor-edit"
                                :disabled="processing"
                                @click="enableEditMode"
                            >
                                <font-awesome-icon icon="pen" />
                                {{ $t("editStack") }}
                            </button>
                            <button
                                v-if="isFullPageEditor"
                                type="button"
                                class="editor-close"
                                :disabled="processing"
                                :title="isAdd ? $t('close') : $t('discardStack')"
                                :aria-label="isAdd ? $t('close') : $t('discardStack')"
                                @click="closeEditor"
                            >
                                <font-awesome-icon icon="times" />
                            </button>
                        </div>

                        <code-mirror
                            ref="editor"
                            v-model="stack.composeYAML"
                            :extensions="extensions"
                            minimal
                            wrap
                            :dark="$root.isDark"
                            tab
                            :disabled="!isEditMode"
                            :hasFocus="editorFocus"
                            @change="yamlCodeChange"
                            @destroy="disposeYamlClient"
                        />

                        <!-- Editor actions -->
                        <div v-if="isFullPageEditor" class="editor-actions">
                            <div class="flex items-stretch overflow-hidden rounded-md" role="group">
                                <button
                                    type="button"
                                    class="ui-btn ui-btn-gradient-primary !rounded-none"
                                    :disabled="processing || !canSaveStack"
                                    @click="requestDeployStack"
                                >
                                    <font-awesome-icon icon="rocket" />
                                    <span class="action-group-text">{{ $t("deployStack") }}</span>
                                </button>
                                <button
                                    type="button"
                                    class="ui-btn !rounded-none"
                                    :disabled="processing || !canSaveStack"
                                    @click="saveStack"
                                >
                                    <font-awesome-icon icon="save" />
                                    <span class="action-group-text">{{ $t("saveStackDraft") }}</span>
                                </button>
                            </div>
                            <button
                                v-if="!isAdd"
                                type="button"
                                class="ui-btn"
                                :disabled="processing"
                                @click="discardStack"
                            >
                                <span class="action-group-text">{{ $t("discardStack") }}</span>
                            </button>
                            <div class="editor-format-btn flex items-stretch">
                                <button
                                    type="button"
                                    class="ui-btn"
                                    :disabled="processing || formattingYaml"
                                    :title="$t('formatYaml')"
                                    @click="formatYaml"
                                >
                                    <font-awesome-icon icon="align-left" />
                                    <span class="action-group-text">{{ $t("formatYaml") }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <FloatingDialog
                v-model="showActionDialog"
                size="sm"
                :title="$t(actionConfirm.title)"
                :ok-title="$t(actionConfirm.ok)"
                :cancel-title="$t('cancel')"
                :ok-variant="actionConfirm.variant"
                :busy="processing"
                @ok="confirmProjectAction"
                @hidden="clearPendingAction"
            >
                <p class="mb-[.5rem]">{{ $t(actionConfirm.message, { name: stack.name }) }}</p>
                <div v-if="actionConfirm.commands?.length" class="mt-3">
                    <pre class="m-0 overflow-x-auto rounded-[0.35rem] bg-background px-3 py-[0.65rem]"><code v-for="(cmd, i) in actionConfirm.commands" :key="i" class="mt-[0.15rem] first:mt-0 block rounded-none bg-transparent p-0 font-app-mono text-sm leading-[1.45] whitespace-pre text-foreground"><span class="text-[#1a7f37] [.dark_&]:text-[#7ee787]">$</span> {{ cmd }}</code></pre>
                </div>
            </FloatingDialog>

            <FloatingDialog
                v-model="showProgressDialog"
                size="lg"
                dialog-class="progress-terminal-dialog"
                :title="progressDialogTitle"
                :hide-footer="true"
                @shown="onProgressDialogShown"
                @hidden="onProgressDialogHidden"
            >
                <template #header>
                    <div class="progress-header-bar">
                        <div class="progress-dialog-title">{{ progressDialogTitle }}</div>
                        <div class="progress-header-tools">
                            <button
                                type="button"
                                class="ui-btn ui-btn-sm"
                                @click="$refs.progressTerminal?.focus()"
                            >
                                <font-awesome-icon icon="terminal" />
                                {{ $t("focusTerminal") }}
                            </button>
                            <button
                                type="button"
                                class="ui-btn ui-btn-sm"
                                :disabled="!progressTerminalHasSelection"
                                @click="$refs.progressTerminal?.copySelection()"
                            >
                                <font-awesome-icon icon="copy" />
                                {{ $t("copySelection") }}
                            </button>
                            <button
                                type="button"
                                class="ui-btn ui-btn-sm"
                                @click="$refs.progressTerminal?.clear()"
                            >
                                <font-awesome-icon icon="trash" />
                                {{ $t("clearDisplay") }}
                            </button>
                        </div>
                    </div>
                </template>
                <Terminal
                    ref="progressTerminal"
                    class="progress-terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    :cols="progressTerminalCols"
                    :show-toolbar="false"
                    :auto-fit="false"
                    @has-data="onProgressTerminalData"
                    @selection-change="progressTerminalHasSelection = $event"
                />
            </FloatingDialog>
        </div>
    </transition>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { yaml } from "@codemirror/lang-yaml";
import { lineNumbers, EditorView } from "@codemirror/view";
import { parseDocument } from "yaml";

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { composeLanguageSupport, formatComposeYaml } from "../editor/compose-language";
import { YamlLanguageClient } from "../editor/yaml-client";
import { getEditorTheme } from "../editor/editor-theme";
import {
    envsubstYAML,
    getComposeTerminalName,
    PROGRESS_TERMINAL_ROWS,
    statusColor,
    stackStatusDetail,
    stackStatusTitle,
    TERMINAL_COLS,
    RUNNING
} from "../../../common/util-common";
import { FloatingDialog, FloatingMenu, FloatingTooltip } from "../components/floating";
import ActionGroup from "../components/ActionGroup.vue";
import dotenv from "dotenv";
import { markRaw, ref } from "vue";

const template = `services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
const envDefault = "# VARIABLE=value #comment";

/**
 * Copy shown in the confirmation dialog of each project action.
 * `ok` uses the action label, `message` is the sentence rendered inside the dialog,
 * `commands` are the docker / compose invocations that will run.
 */
const PROJECT_ACTIONS = {
    deployStack: {
        title: "deployProjectConfirmTitle",
        message: "deployProjectConfirmMsg",
        ok: "deployStack",
        variant: "primary",
        commands: [ "docker compose up -d --remove-orphans" ],
    },
    startStack: {
        title: "startProjectConfirmTitle",
        message: "startProjectConfirmMsg",
        ok: "startStack",
        variant: "primary",
        commands: [ "docker compose up -d --remove-orphans" ],
    },
    restartStack: {
        title: "restartProjectConfirmTitle",
        message: "restartProjectConfirmMsg",
        ok: "restartStack",
        variant: "primary",
        commands: [ "docker compose restart" ],
    },
    updateStack: {
        title: "updateProjectConfirmTitle",
        message: "updateProjectConfirmMsg",
        ok: "updateStack",
        variant: "primary",
        commands: [
            "docker compose pull",
            "docker compose up -d --remove-orphans",
        ],
    },
    stopStack: {
        title: "stopProjectConfirmTitle",
        message: "stopProjectConfirmMsg",
        ok: "stopStack",
        variant: "warning",
        commands: [ "docker compose stop" ],
    },
    downStack: {
        title: "downProjectConfirmTitle",
        message: "downProjectConfirmMsg",
        ok: "downStack",
        variant: "warning",
        commands: [ "docker compose down" ],
    },
    deleteStack: {
        title: "deleteProjectConfirmTitle",
        message: "deleteProjectConfirmMsg",
        ok: "deleteStack",
        variant: "danger",
        commands: [ "docker compose down --remove-orphans" ],
    },
};

let serviceStatusTimeout = null;
let dockerStatsTimeout = null;
let progressCloseTimer = null;

export default {
    components: {
        FontAwesomeIcon,
        CodeMirror,
        FloatingDialog,
        FloatingMenu,
        FloatingTooltip,
        ActionGroup,
    },
    beforeRouteUpdate(to, from, next) {
        this.exitConfirm(next);
    },
    beforeRouteLeave(to, from, next) {
        this.exitConfirm(next);
    },
    setup() {
        const editorFocus = ref(false);
        const yamlClient = markRaw(new YamlLanguageClient());

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const baseExtensions = [
            yaml(),
            composeLanguageSupport(yamlClient),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        return {
            baseExtensions,
            editorFocus,
            disposeYamlClient: () => yamlClient.dispose(),
        };
    },
    data() {
        return {
            jsonConfig: {},
            envsubstJSONConfig: {},
            processing: true,
            stack: {

            },
            serviceStatusList: {},
            dockerStats: {},
            isEditMode: false,
            submitted: false,
            formattingYaml: false,
            showActionDialog: false,
            pendingAction: null,
            showProgressDialog: false,
            progressAction: null,
            progressCommands: [],
            progressTerminalHasSelection: false,
            progressResult: null,
            progressCloseIn: 0,
            pendingProgressRun: null,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            progressTerminalCols: TERMINAL_COLS,
            compactTab: "containers",
            stopServiceStatusTimeout: false,
            stopDockerStatsTimeout: false,
        };
    },
    computed: {
        extensions() {
            return [
                getEditorTheme(this.$root.isDark),
                ...this.baseExtensions,
            ];
        },

        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },

        /**
         * Row actions of the project. The first ones are rendered as buttons (as many
         * as fit), `menuOnly` ones are always kept inside the overflow menu.
         * @returns {object[]}
         */
        projectActions() {
            const actions = [];

            if (this.active) {
                actions.push({ key: "restartStack",
                    i18nKey: "restartStack",
                    icon: "rotate",
                    variant: "normal" });
                actions.push({ key: "updateStack",
                    i18nKey: "updateStack",
                    icon: "cloud-arrow-down",
                    variant: "normal" });
                actions.push({ key: "stopStack",
                    i18nKey: "stopStack",
                    icon: "stop",
                    variant: "warning" });
            } else {
                actions.push({ key: "startStack",
                    i18nKey: "startStack",
                    icon: "play",
                    variant: "primary" });
            }

            if (!this.active) {
                actions.push({ key: "updateStack",
                    i18nKey: "updateStack",
                    icon: "cloud-arrow-down",
                    variant: "normal",
                    menuOnly: true });
            }
            actions.push({ key: "downStack",
                i18nKey: "downStack",
                icon: "stop",
                variant: "warning",
                menuOnly: true });
            actions.push({ key: "deleteStack",
                i18nKey: "deleteStack",
                icon: "trash",
                variant: "danger",
                menuOnly: true });

            return actions;
        },

        /**
         * Copy for the confirmation dialog of the pending project action.
         * @returns {{ title: string, message: string, ok: string, variant: string, commands: string[] }}
         */
        actionConfirm() {
            return PROJECT_ACTIONS[this.pendingAction] ?? PROJECT_ACTIONS.startStack;
        },

        /**
         * Title for the progress terminal dialog.
         * @returns {string}
         */
        progressDialogTitle() {
            if (this.progressAction) {
                return this.$t(this.progressAction);
            }
            return this.$t("terminal");
        },

        urls() {
            if (!this.envsubstJSONConfig["x-dockge"] || !this.envsubstJSONConfig["x-dockge"].urls || !Array.isArray(this.envsubstJSONConfig["x-dockge"].urls)) {
                return [];
            }

            let urls = [];
            for (const url of this.envsubstJSONConfig["x-dockge"].urls) {
                let display;
                try {
                    let obj = new URL(url);
                    let pathname = obj.pathname;
                    if (pathname === "/") {
                        pathname = "";
                    }
                    display = obj.host + pathname + obj.search;
                } catch {
                    display = url;
                }

                urls.push({
                    display,
                    url,
                });
            }
            return urls;
        },

        isAdd() {
            return this.$route.path === "/compose" && !this.submitted;
        },

        isFullPageEditor() {
            return this.isAdd || this.isEditMode;
        },

        stacksDirectoryPath() {
            const key = this.stack.endpoint || "current";
            return this.$root.stacksDirectoryPaths[key]
                || this.$root.stacksDirectoryPaths.current
                || "stacks";
        },

        agentPathOptions() {
            const options = [];
            const agents = Object.entries(this.$root.agentList || {});

            if (agents.length === 0) {
                const dir = (this.$root.stacksDirectoryPaths.current || "stacks").replace(/\/+$/, "");
                options.push({
                    endpoint: "",
                    path: dir,
                    agentLabel: this.$t("Current"),
                    offline: false,
                });
                return options;
            }

            for (const [ endpoint, agent ] of agents) {
                const pathKey = endpoint || "current";
                const dir = (this.$root.stacksDirectoryPaths[pathKey]
                    || this.$root.stacksDirectoryPaths.current
                    || "stacks").replace(/\/+$/, "");
                const agentLabel = (agent.name !== "" ? agent.name : null) || agent.url || this.$t("Current");
                const status = this.$root.agentStatusList[endpoint];
                options.push({
                    endpoint,
                    path: dir,
                    agentLabel,
                    offline: status != null && status !== "online",
                });
            }
            return options;
        },

        canSaveStack() {
            if (!this.isAdd) {
                return true;
            }
            return /^[a-z0-9_-]+$/.test(this.stack.name || "");
        },

        /**
         * Get the stack from the global stack list, because it may contain more real-time data like status
         * @return {*}
         */
        globalStack() {
            return this.$root.completeStackList[this.stack.name + "_" + this.endpoint];
        },

        /**
         * Status tooltip of the project title: a sentence plus the raw compose status.
         * @returns {object}
         */
        projectStatus() {
            const stack = this.globalStack || this.stack;
            return {
                title: stackStatusTitle(stack),
                detail: this.formatStackStatusDetail(stack),
            };
        },

        status() {
            return this.globalStack?.status;
        },

        active() {
            return this.status === RUNNING;
        },

        displayServiceNames() {
            const configuredServices = Object.keys(this.jsonConfig.services || {});
            return Array.from(new Set([
                ...configuredServices,
                ...Object.keys(this.serviceStatusList || {})
            ])).sort((a, b) => a.localeCompare(b));
        },

        terminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getComposeTerminalName(this.endpoint, this.stack.name);
        },

        networks() {
            return this.jsonConfig.networks;
        },

        endpoint() {
            return this.stack.endpoint || this.$route.params.endpoint || "";
        },

        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },

    },
    watch: {
        "stack.composeYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeENV": {
            handler() {
                if (this.editorFocus) {
                    console.debug("env code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        $route(to, from) {

        }
    },
    mounted() {
        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML = template;
            let composeENV;

            if (this.$root.envTemplate) {
                composeENV = this.$root.envTemplate;
                this.$root.envTemplate = "";
            } else {
                composeENV = envDefault;
            }

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                composeFileName: "compose.yaml",
                isManagedByDockge: true,
                endpoint: "",
            };

            this.yamlCodeChange();

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        this.requestDockerStats();
    },
    methods: {
        statusColor,

        /**
         * Localize the status detail line under the project title tooltip.
         * Compose statuses are shown as "containers running(1), …".
         * @param {object|null|undefined} stack Stack status payload.
         * @returns {string}
         */
        formatStackStatusDetail(stack) {
            if (stack?.composeStatus) {
                return this.$t("projectStatusContainers", { status: stack.composeStatus });
            }
            const detail = stackStatusDetail(stack);
            return this.$te(detail) ? this.$t(detail) : detail;
        },

        startServiceStatusTimeout() {
            clearTimeout(serviceStatusTimeout);
            serviceStatusTimeout = setTimeout(async () => {
                this.requestServiceStatus();
            }, 5000);
        },

        startDockerStatsTimeout() {
            clearTimeout(dockerStatsTimeout);
            dockerStatsTimeout = setTimeout(async () => {
                this.requestDockerStats();
            }, 5000);
        },

        requestServiceStatus() {
            // Do not request if it is add mode
            if (this.isAdd) {
                return;
            }

            this.$root.emitAgent(this.endpoint, "serviceStatusList", this.stack.name, (res) => {
                if (res.ok) {
                    this.serviceStatusList = res.serviceStatusList;
                }
                if (!this.stopServiceStatusTimeout) {
                    this.startServiceStatusTimeout();
                }
            });
        },

        requestDockerStats() {
            this.$root.emitAgent(this.endpoint, "dockerStats", (res) => {
                if (res.ok) {
                    this.dockerStats = res.dockerStats;
                }
                if (!this.stopDockerStatsTimeout) {
                    this.startDockerStatsTimeout();
                }
            });
        },

        exitConfirm(next) {
            if (this.isEditMode) {
                if (confirm(this.$t("confirmLeaveStack"))) {
                    this.exitAction();
                    next();
                } else {
                    next(false);
                }
            } else {
                this.exitAction();
                next();
            }
        },

        exitAction() {
            console.log("exitAction");
            this.stopServiceStatusTimeout = true;
            this.stopDockerStatsTimeout = true;
            clearTimeout(serviceStatusTimeout);
            clearTimeout(dockerStatsTimeout);
            this.clearProgressCloseTimer();
        },

        bindTerminal(callback) {
            // Skip replaying the server buffer: stale progress frames with a mismatched
            // PTY size turn into dozens of wrapped lines. Keep a clean screen and stream
            // live output with cols locked to TERMINAL_COLS (matches backend PTY).
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName, () => {
                this.$refs.progressTerminal?.reset();
                this.writeProgressCommands();
                callback?.();
            }, { skipBuffer: true });
        },

        /**
         * Echo the compose/docker commands into the progress terminal before output streams.
         * @returns {void}
         */
        writeProgressCommands() {
            if (!this.progressCommands?.length) {
                return;
            }
            const lines = this.progressCommands
                .map((cmd) => `\x1b[38;2;126;231;135m$ ${cmd}\x1b[0m`)
                .join("\r\n");
            this.$refs.progressTerminal?.write(`${lines}\r\n\r\n`);
        },

        /**
         * Open the progress terminal dialog, bind it, then run the action so
         * compose output is streamed into the modal instead of the page.
         * @param {string} actionKey i18n key used as the dialog title
         * @param {() => void} run Action that emits the agent request
         * @param {string[]} [commands] Commands echoed into the terminal
         * @returns {void}
         */
        runWithProgress(actionKey, run, commands) {
            this.clearProgressCloseTimer();
            this.processing = true;
            this.progressAction = actionKey;
            this.progressCommands = commands ?? PROJECT_ACTIONS[actionKey]?.commands ?? [];
            this.progressResult = null;
            this.progressCloseIn = 0;
            this.submitted = true;

            if (this.showProgressDialog) {
                this.bindTerminal(run);
                return;
            }

            this.pendingProgressRun = run;
            this.showProgressDialog = true;
        },

        onProgressDialogShown() {
            this.bindTerminal(() => {
                const run = this.pendingProgressRun;
                this.pendingProgressRun = null;
                run?.();
            });
        },

        onProgressTerminalData() {
            this.submitted = true;
        },

        onProgressDialogHidden() {
            this.clearProgressCloseTimer();
            this.progressResult = null;
            this.progressCloseIn = 0;
            this.progressTerminalHasSelection = false;
        },

        /**
         * Mark the progress dialog finished and auto-close on success.
         * Toast only if the user already dismissed the modal.
         * @param {{ ok?: boolean }} res Agent response
         * @returns {void}
         */
        finishProgress(res) {
            const dismissed = !this.showProgressDialog;
            this.processing = false;
            this.progressResult = res?.ok ? "ok" : "error";
            this.clearProgressCloseTimer();

            if (dismissed) {
                this.$root.toastRes(res);
                return;
            }

            if (!res?.ok) {
                return;
            }

            this.progressCloseIn = 3;
            this.writeProgressClosing(this.progressCloseIn);
            progressCloseTimer = setInterval(() => {
                this.progressCloseIn -= 1;
                if (this.progressCloseIn <= 0) {
                    this.clearProgressCloseTimer();
                    this.showProgressDialog = false;
                    return;
                }
                this.writeProgressClosing(this.progressCloseIn);
            }, 1000);
        },

        /**
         * Echo the auto-close countdown into the progress terminal.
         * @param {number} n Seconds remaining
         * @returns {void}
         */
        writeProgressClosing(n) {
            const msg = this.$t("progressClosingIn", { n });
            const colored = `\x1b[38;2;134;230;169m${msg}\x1b[0m`;
            if (n === 3) {
                this.$refs.progressTerminal?.write(`\r\n${colored}`);
            } else {
                this.$refs.progressTerminal?.write(`\r\x1b[2K${colored}`);
            }
        },

        clearProgressCloseTimer() {
            if (progressCloseTimer) {
                clearInterval(progressCloseTimer);
                progressCloseTimer = null;
            }
        },

        loadStack() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getStack", this.stack.name, (res) => {
                if (res.ok) {
                    this.stack = res.stack;
                    this.yamlCodeChange();
                    this.processing = false;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        deployStack() {
            this.runWithProgress("deployStack", () => {
                this.$root.emitAgent(this.stack.endpoint, "deployStack", this.stack.name, this.composeEditorContent(), this.stack.composeENV, this.isAdd, (res) => {
                    this.finishProgress(res);

                    if (res.ok) {
                        this.stack.name = res.name;
                        this.isEditMode = false;
                        this.clearProgressCloseTimer();
                        this.showProgressDialog = false;
                        this.$router.push(this.url);
                    }
                });
            }, [ "docker compose up -d --remove-orphans" ]);
        },

        /**
         * Validate the compose file, then open the deploy confirmation dialog.
         * Deploy saves compose.yaml / .env and runs `docker compose up -d --remove-orphans`.
         * @returns {void}
         */
        requestDeployStack() {
            if (!this.canSaveStack || this.processing) {
                return;
            }

            if (!this.jsonConfig.services) {
                this.$root.toastError("No services found in compose.yaml");
                return;
            }

            if (typeof this.jsonConfig.services !== "object") {
                this.$root.toastError("Services must be an object");
                return;
            }

            const serviceNameList = Object.keys(this.jsonConfig.services);

            // Set the stack name if empty, use the first container name
            if (!this.stack.name && serviceNameList.length > 0) {
                const serviceName = serviceNameList[0];
                const service = this.jsonConfig.services[serviceName];

                if (service && service.container_name) {
                    this.stack.name = service.container_name;
                } else {
                    this.stack.name = serviceName;
                }
            }

            this.requestProjectAction("deployStack");
        },

        /** Return the editor document verbatim, including comments and trailing newline. */
        composeEditorContent() {
            return this.$refs.editor?.view?.state.doc.toString() ?? this.stack.composeYAML;
        },

        saveStack() {
            if (!this.canSaveStack) {
                return;
            }

            this.processing = true;

            this.$root.emitAgent(this.stack.endpoint, "saveStack", this.stack.name, this.composeEditorContent(), this.stack.composeENV, this.isAdd, (res) => {
                this.processing = false;
                if (!res.ok) {
                    this.$root.toastRes(res);
                }

                if (res.ok) {
                    this.stack.name = res.name;
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        requestProjectAction(action) {
            if (this.processing) {
                return;
            }
            this.pendingAction = action;
            this.showActionDialog = true;
        },

        confirmProjectAction() {
            if (this.processing || !this.pendingAction) {
                return;
            }
            const action = this.pendingAction;
            this.showActionDialog = false;
            this[action]();
        },

        /**
         * Drop the pending action once the dialog has finished its leave transition,
         * so the copy does not change while it is animating out.
         * @returns {void}
         */
        clearPendingAction() {
            this.pendingAction = null;
        },

        startStack() {
            this.runWithProgress("startStack", () => {
                this.$root.emitAgent(this.endpoint, "startStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        stopStack() {
            this.runWithProgress("stopStack", () => {
                this.$root.emitAgent(this.endpoint, "stopStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        downStack() {
            this.runWithProgress("downStack", () => {
                this.$root.emitAgent(this.endpoint, "downStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        restartStack() {
            this.runWithProgress("restartStack", () => {
                this.$root.emitAgent(this.endpoint, "restartStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        updateStack() {
            this.runWithProgress("updateStack", () => {
                this.$root.emitAgent(this.endpoint, "updateStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        deleteStack() {
            this.runWithProgress("deleteStack", () => {
                this.$root.emitAgent(this.endpoint, "deleteStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                    if (res.ok) {
                        this.clearProgressCloseTimer();
                        this.showProgressDialog = false;
                        this.$router.push("/");
                    }
                });
            });
        },

        discardStack() {
            this.loadStack();
            this.isEditMode = false;
        },

        /**
         * Toolbar × — discard edits and leave the full-page editor.
         * New projects navigate home (route guard asks if needed).
         * @returns {void}
         */
        closeEditor() {
            if (this.isAdd) {
                this.$router.push("/");
                return;
            }
            this.discardStack();
        },

        async formatYaml() {
            const view = this.$refs.editor?.view;
            if (!view || this.formattingYaml) {
                return;
            }
            this.formattingYaml = true;
            try {
                await formatComposeYaml(view);
                this.stack.composeYAML = view.state.doc.toString();
                this.yamlCodeChange();
            } catch (e) {
                this.$root.toastError(e instanceof Error ? e.message : String(e));
            } finally {
                this.formattingYaml = false;
            }
        },

        yamlToJSON(yamlText) {
            const doc = parseDocument(yamlText);
            if (doc.errors.length > 0) {
                throw doc.errors[0];
            }

            const config = doc.toJS() ?? {};
            if (config.services != null && (Array.isArray(config.services) || typeof config.services !== "object")) {
                throw new Error("Services must be an object");
            }

            return config;
        },

        yamlCodeChange() {
            try {
                // Parsed data drives previews only; never serialize it into the editor.
                // Schema/syntax issues are shown as editor underlines — no duplicate text banner.
                this.jsonConfig = this.yamlToJSON(this.stack.composeYAML);

                const env = dotenv.parse(this.stack.composeENV);
                this.envsubstJSONConfig = envsubstYAML(this.stack.composeYAML, env);
            } catch {
                // Keep the last good preview state while the document is incomplete.
            }
        },

        enableEditMode() {
            this.isEditMode = true;
        },

        checkYAML() {

        },

        normalizeStackFolderName() {
            // Keep trailing "-" while typing (e.g. "my-…"); strip only illegal chars.
            this.stack.name = (this.stack.name || "")
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, "");
        },

        finalizeStackFolderName() {
            this.normalizeStackFolderName();
            this.stack.name = (this.stack.name || "").replace(/^-+|-+$/g, "");
        },

        selectAgentPath(endpoint) {
            this.stack.endpoint = endpoint;
        },

        startService(serviceName) {
            this.runWithProgress("startStack", () => {
                this.$root.emitAgent(this.endpoint, "startService", this.stack.name, serviceName, (res) => {
                    this.finishProgress(res);

                    if (res.ok) {
                        this.requestServiceStatus();
                    }
                });
            }, [ `docker compose up -d ${serviceName}` ]);
        },

        stopService(serviceName) {
            this.runWithProgress("stopStack", () => {
                this.$root.emitAgent(this.endpoint, "stopService", this.stack.name, serviceName, (res) => {
                    this.finishProgress(res);

                    if (res.ok) {
                        this.requestServiceStatus();
                    }
                });
            }, [ `docker compose stop ${serviceName}` ]);
        },

        restartService(serviceName) {
            this.runWithProgress("restartStack", () => {
                this.$root.emitAgent(this.endpoint, "restartService", this.stack.name, serviceName, (res) => {
                    this.finishProgress(res);

                    if (res.ok) {
                        this.requestServiceStatus();
                    }
                });
            }, [ `docker compose restart ${serviceName}` ]);
        },
    }
};
</script>

<style scoped lang="scss">
.project-status-dot.tone-primary { background: var(--primary) !important; }
.project-status-dot.tone-warning { background: var(--warning) !important; }
.project-status-dot.tone-danger { background: var(--destructive) !important; }
.project-status-dot.tone-stopped { background: var(--warning) !important; }
.project-status-dot.tone-secondary { background: var(--muted) !important; }
.progress-terminal {
    height: 288px;
}

.stack-folder-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    .stack-path-full {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.7rem;
        border: 1px solid var(--border);
        border-radius: 0.375rem;
        background-color: var(--background);
        color: var(--muted-foreground);
        font-family: var(--font-mono);
        font-size: var(--text-sm-fontSize);
        line-height: 1.45;
        text-align: start;
        cursor: pointer;
        &:hover,
        &:focus-visible,
        &.open {
            border-color: var(--primary);
            outline: none;
        }
    }

    .stack-path-dir {
        color: var(--muted-foreground);
    }

    .stack-path-text {
        flex: 1 1 auto;
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-all;
        text-align: start;
    }

    .stack-path-name {
        color: var(--foreground);

        &.is-placeholder {
            color: var(--muted-foreground);
            opacity: 0.5;
        }
    }

    .stack-path-caret {
        flex: 0 0 auto;
        font-size: 0.7rem;
        opacity: 0.75;
    }

    .ui-field {
        font-family: var(--font-mono);
    }
}

.editor-box {
    display: flex;
    overflow: hidden;
    flex-direction: column;
    padding: 0;
    font-family: var(--font-mono);
    font-size: var(--text-sm-fontSize);

    :deep(.vue-codemirror) {
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
    }

    :deep(.cm-editor) {
        height: 100%;
        min-height: 0;
    }

    :deep(.cm-scroller) {
        overflow: auto;
        scrollbar-gutter: stable;
    }

    :deep(.cm-content) {
        padding-right: 1rem;
    }

    :deep(.cm-gutters) {
        padding-left: 0.4rem;
    }
}

.editor-toolbar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--border);
}

.editor-filename {
    overflow: hidden;
    min-width: 0;
    margin-right: auto;
    color: var(--muted-foreground);
    font-family: inherit;
    font-size: var(--text-sm-fontSize);
    font-weight: var(--fontWeight-medium);
    letter-spacing: 0.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.editor-edit {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 28px;
    padding: 0.2rem 0.65rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-foreground);
    font-family: inherit;
    font-size: var(--text-sm-fontSize);
    font-weight: var(--fontWeight-medium);
    line-height: 1;
    white-space: nowrap;
    transition: background-color 0.15s ease, color 0.15s ease;

    svg {
        display: block;
        width: 0.85em;
        height: 0.85em;
        flex: 0 0 auto;
    }

    &:hover:not(:disabled) {
        background: var(--hover);
        color: var(--foreground);
    }

    &:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 1px;
        color: var(--foreground);
    }

    &:disabled {
        cursor: not-allowed;
        color: var(--muted-foreground);
    }
}

.editor-close {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-foreground);
    line-height: 1;
    transition: background-color 0.15s ease, color 0.15s ease;

    svg {
        display: block;
        width: 0.9em;
        height: 0.9em;
    }

    &:hover:not(:disabled) {
        background: var(--hover);
        color: var(--foreground);
    }

    &:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 1px;
        color: var(--foreground);
    }

    &:disabled {
        cursor: not-allowed;
        color: var(--muted-foreground);
    }
}

.editor-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid var(--border);
    // Break out of `.editor-box` monospace so buttons match ActionGroup.
    font-family: var(--font-ui);
    font-size: var(--text-base-fontSize);
    font-weight: var(--fontWeight-normal);

    .editor-format-btn {
        margin-inline-start: auto;
    }
}

.stack-label {
    margin-inline-start: 0.35rem;
    font-size: 1.25rem;
    font-weight: var(--fontWeight-normal);
}

.compact-tab {
    flex: 1 1 0;
    min-width: 0;
    min-height: 38px;
    padding: 0.35rem 0.75rem;
    border-radius: 0.5rem;
    color: var(--secondary-foreground);
    font-size: var(--text-sm-fontSize);
    font-weight: var(--fontWeight-medium);
    background: transparent;
    transition: color 0.15s ease, background 0.15s ease;

    &:hover:not(.active) {
        background: var(--hover);
    }

    &.active {
        color: var(--primary);
        background: var(--selected);
    }

    &:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
    }
}

.project-header {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1rem;

    .project-title {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.stack-actions {
    flex: 1 0 38px;
    min-width: 38px;
    align-items: center;
    justify-content: flex-end;
}

@media (max-width: 991.98px) {
    .stack-actions {
        flex-basis: 44px;
        min-width: 44px;
    }

    .editor-box :deep(.cm-editor) {
        min-height: 52dvh;
    }
}

@media (min-width: 992px) {
    .compose-page.stack-view-mode {
        display: flex;
        overflow: hidden;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .stack-view-mode > .stack-content {
        margin-inline: -0.5rem;
        overflow: hidden;
        flex: 1 1 0;
        min-height: 0;
    }

    .stack-view-mode .containers-column,
    .stack-view-mode .compose-column {
        padding-inline: 0.5rem;
        height: 100%;
        min-height: 0;
    }

    .stack-view-mode .containers-column {
        display: flex;
        flex-direction: column;
    }

    .stack-view-mode .container-list {
        overflow-y: auto;
        flex: 1 1 auto;
        min-height: 0;
        overscroll-behavior: contain;
    }

    .stack-view-mode .compose-column {
        display: flex;
        overflow: hidden;
        flex-direction: column;
        overscroll-behavior: contain;
    }

    .stack-view-mode .compose-column > .editor-box {
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
        margin-bottom: 0 !important;
    }

    .compose-page.full-page-editor {
        display: flex;
        overflow: hidden;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .full-page-editor > .stack-content {
        margin-inline: 0;
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
    }

    .full-page-editor .compose-column {
        padding-inline: 0;
        display: flex;
        overflow: hidden;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .full-page-editor .compose-column > .editor-box {
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
        padding-bottom: 0;
        margin-bottom: 0 !important;
    }

    .full-page-editor .compose-column > .editor-box :deep(.vue-codemirror) {
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
    }

    .full-page-editor .compose-column > .editor-box :deep(.cm-editor) {
        height: 100%;
        min-height: 0;
    }

    .full-page-editor .compose-column > .editor-box :deep(.cm-scroller) {
        overflow: auto;
    }
}

</style>

<style lang="scss">
.progress-terminal-dialog.floating-dialog {
    // Wide enough for TERMINAL_COLS (105) at 14px mono without wrapping progress lines
    --fd-width: 940px;
    overflow: hidden;
    border: 1px solid var(--terminal-border);
    background: var(--terminal-bar);
    color: var(--terminal-foreground);
    .fd-header {
        gap: 0.5rem;
        min-height: 34px;
        padding: 0.3rem 0.4rem 0.3rem 0.65rem;
        border-bottom: 1px solid var(--terminal-border);
    }

    .progress-header-bar {
        display: flex;
        flex: 1 1 auto;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
    }

    .progress-dialog-title {
        overflow: hidden;
        flex: 1 1 auto;
        min-width: 0;
        margin: 0;
        color: var(--terminal-foreground);
        font-size: var(--text-xs-fontSize);
        font-weight: var(--fontWeight-semibold);
        letter-spacing: 0.01em;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .progress-header-tools {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 0.15rem;

        .ui-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            min-height: 24px !important;
            height: 24px;
            padding: 0 0.45rem !important;
            border-radius: 4px;
            color: var(--terminal-muted) !important;
            font-size: var(--text-xs-fontSize);
            font-weight: var(--fontWeight-medium);
            line-height: 1;
            background: transparent !important;
            .svg-inline--fa {
                font-size: 0.65rem;
                opacity: 0.9;
            }

            &:hover,
            &:focus-visible {
                color: var(--terminal-strong) !important;
                background: rgba(255, 255, 255, 0.08) !important;
            }

            &:disabled {
                opacity: 0.35;
            }
        }
    }

    .fd-close {
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        border-radius: 6px;
        color: var(--terminal-foreground);
    }

    .fd-body {
        display: flex;
        flex-direction: column;
        padding: 0;
        min-height: 0;
        background: var(--terminal-background);
    }

    .progress-terminal.terminal-shell,
    .progress-terminal {
        flex: 1 1 auto;
        // 16 rows × ~18px cell height — keep in sync with PROGRESS_TERMINAL_ROWS
        height: 288px;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: var(--terminal-background) !important;
    }

    .progress-terminal .main-terminal {
        overflow: hidden;
        height: 100%;
        padding: 0 !important;
    }

    // Progress output is short; xterm's always-on scrollbars were showing as a
    // thick grey bar under the last line.
    .progress-terminal .xterm,
    .progress-terminal .xterm-viewport {
        overflow: hidden !important;
    }

    .progress-terminal .xterm-viewport {
        width: 100% !important;
        height: 100% !important;
    }

    .progress-terminal .xterm-screen {
        width: 100% !important;
    }
}

.stack-path-menu.floating-menu-panel {
    padding: 0.35rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--popover);
    color: var(--secondary-foreground);
    .stack-path-option {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.15rem;
        width: 100%;
        padding: 0.55rem 0.7rem;
        border-radius: 8px;
        font-family: var(--font-mono);
        font-size: var(--text-sm-fontSize);
        line-height: 1.35;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-all;
    }

    .stack-path-option-dir {
        color: var(--muted-foreground);
    }

    .stack-path-option-name {
        color: var(--foreground);

        &.is-placeholder {
            color: var(--muted-foreground);
            opacity: 0.5;
        }
    }

    .stack-path-option-agent {
        color: var(--muted-foreground);
        font-family: inherit;
        font-size: var(--text-xs-fontSize);
    }

    .stack-path-option.active {
        background: var(--selected);
    }

    .stack-path-option:hover:not(:disabled),
    .stack-path-option:focus-visible {
        background: var(--hover);
        outline: none;
    }

    .stack-path-option:disabled {
        color: var(--muted-foreground);
    }
}
</style>
