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
                    <div class="stack-name-input">
                        <input
                            id="name"
                            v-model="stack.name"
                            type="text"
                            class="ui-field"
                            required
                            spellcheck="false"
                            autocomplete="off"
                            :placeholder="$t('stackFolderPlaceholder')"
                            @blur="stack.name = stack.name.trim()"
                        >
                        <span v-if="!stack.name" class="stack-name-placeholder" aria-hidden="true">
                            <span class="stack-name-placeholder-text">{{ $t("stackFolderPlaceholder") }}</span><span class="stack-name-required"> *</span>
                        </span>
                    </div>
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
                            <div class="editor-tabs-wrap">
                                <div ref="fileTabs" class="editor-file-tabs" role="tablist" :aria-label="$t('projectFiles')" @wheel="onFileTabsWheel">
                                    <div v-for="file in [stack.composeFileName, ...editableFiles]" :key="file" class="editor-file-tab" :class="{ active: selectedFile === file, 'pending-delete': stagedDeletedFiles.includes(file) }">
                                        <span v-if="renamingFile === file && !stagedDeletedFiles.includes(file)" class="editor-file-rename">
                                            <font-awesome-icon :icon="file === stack.composeFileName ? faDocker : 'gear'" class="editor-file-icon" aria-hidden="true" />
                                            <FloatingTooltip placement="bottom-start" :disabled="validFilenameDraft" panel-class="text-destructive">
                                                <template #trigger="{ triggerAttrs }">
                                                    <span class="editor-filename-wrap" v-bind="triggerAttrs">
                                                        <span class="editor-filename-measure" aria-hidden="true">{{ filenameDraft || ' ' }}</span>
                                                        <input
                                                            ref="filenameInput"
                                                            v-model="filenameDraft"
                                                            class="editor-filename-input"
                                                            :aria-label="$t('composeFilename')"
                                                            :aria-invalid="!validFilenameDraft"
                                                            spellcheck="false"
                                                            @keydown.enter.prevent="$event.target.blur()"
                                                            @keydown.esc.prevent="resetFilename"
                                                            @blur="commitFilename"
                                                        />
                                                    </span>
                                                </template>
                                                {{ $t('filenamePatternInvalid', { patterns: file === stack.composeFileName ? composeFilePatterns : editableFilePatterns }) }}
                                            </FloatingTooltip>
                                        </span>
                                        <button v-else type="button" role="tab" class="editor-file-name" :aria-selected="selectedFile === file" @click="chooseFile(file)">
                                            <font-awesome-icon :icon="file === stack.composeFileName ? faDocker : 'gear'" class="editor-file-icon" aria-hidden="true" />
                                            <span class="editor-file-label">{{ file }}</span>
                                            <span v-if="!stagedDeletedFiles.includes(file) && fileHasPendingChanges(file)" class="editor-file-dirty" :class="{ 'is-new': file !== stack.composeFileName && !editableFilesOnDisk.includes(file) }" :title="$t(file !== stack.composeFileName && !editableFilesOnDisk.includes(file) ? 'newEditableFile' : 'fileChange')" aria-hidden="true">{{ file !== stack.composeFileName && !editableFilesOnDisk.includes(file) ? '+' : '•' }}</span>
                                        </button>
                                        <button v-if="selectedFile === file && file !== stack.composeFileName" type="button" class="editor-tab-close" :aria-label="$t(stagedDeletedFiles.includes(file) ? 'undoDeleteEditableFile' : 'deleteEditableFile')" :title="$t(stagedDeletedFiles.includes(file) ? 'undoDeleteEditableFile' : 'deleteEditableFile')" @click="toggleDeleteEditableFile(file)">{{ stagedDeletedFiles.includes(file) ? '↶' : '×' }}</button>
                                    </div>
                                    <span v-if="addingFile" class="editor-file-tab editor-file-new" @focusout="cancelNewFile">
                                        <font-awesome-icon icon="gear" class="editor-file-icon" aria-hidden="true" />
                                        <FloatingTooltip placement="bottom-start" :disabled="!newFileName || validNewFileName" panel-class="text-destructive">
                                            <template #trigger="{ triggerAttrs }">
                                                <span class="editor-filename-wrap" v-bind="triggerAttrs">
                                                    <span class="editor-filename-measure" aria-hidden="true">{{ newFileName || $t('newEditableFile') }}</span>
                                                    <input
                                                        ref="newFileInput"
                                                        v-model="newFileName"
                                                        class="editor-filename-input"
                                                        :aria-label="$t('editableFileNamePrompt')"
                                                        :aria-invalid="!!newFileName && !validNewFileName"
                                                        :placeholder="$t('newEditableFile')"
                                                        spellcheck="false"
                                                        @keydown.enter.prevent="createEditableFile"
                                                        @keydown.esc.prevent="cancelNewFile"
                                                    />
                                                </span>
                                            </template>
                                            {{ $t('filenamePatternInvalid', { patterns: editableFilePatterns }) }}
                                        </FloatingTooltip>
                                    </span>
                                </div>
                            </div>
                            <button type="button" class="editor-tab-add" :aria-label="$t('newEditableFile')" :title="$t('newEditableFile')" @click="startNewFile">+</button>
                        </div>

                        <code-mirror
                            :key="`${endpoint}:${stack.projectDir || stack.name}:${selectedFile}`"
                            ref="editor"
                            v-model="editorContent"
                            :extensions="selectedSchemaLanguage ? schemaExtensions : (selectedFile === stack.composeFileName ? extensions : envExtensions)"
                            minimal
                            wrap
                            :dark="$root.isDark"
                            tab
                            :disabled="!isEditMode"
                            :hasFocus="editorFocus"
                            @change="onEditorChange"
                        />
                        <div v-if="diffPopup" ref="diffPopup" class="editor-diff-popup" :style="diffPopupStyle" role="dialog" :aria-label="$t('fileChange')">
                            <div class="editor-diff-popup-header">
                                <span>{{ $t('fileChange') }}</span>
                                <div class="editor-diff-popup-actions">
                                    <button type="button" :aria-label="$t('revertFileChange')" :title="$t('revertFileChange')" :disabled="!isEditMode || processing" @click="revertDiffChange">
                                        <font-awesome-icon icon="undo" />
                                    </button>
                                    <button type="button" :aria-label="$t('close')" @click="diffPopup = null"><font-awesome-icon icon="times" /></button>
                                </div>
                            </div>
                            <pre v-if="diffPopup.before" class="editor-diff-removed"><span class="editor-diff-prefix">− </span>{{ diffPopup.before }}</pre>
                            <pre v-if="diffPopup.after" class="editor-diff-added"><span class="editor-diff-prefix">+ </span>{{ diffPopup.after }}</pre>
                        </div>

                        <!-- Editor actions -->
                        <div v-if="!isFullPageEditor && stack.isManagedByDockge" class="editor-actions editor-view-actions">
                            <button type="button" class="editor-edit" :disabled="processing || (selectedFile !== stack.composeFileName && !Object.hasOwn(fileContents, selectedFile))" @click="copyCurrentFile">
                                <font-awesome-icon :icon="fileCopied ? 'check' : 'copy'" />
                                {{ $t(fileCopied ? 'fileCopied' : 'copyFile') }}
                            </button>
                            <button type="button" class="editor-edit" :disabled="processing" @click="enableEditMode">
                                <font-awesome-icon icon="pen" />
                                {{ $t("editStack") }}
                            </button>
                        </div>
                        <div v-if="isFullPageEditor" class="editor-actions">
                            <div class="flex items-stretch overflow-hidden rounded-md" role="group">
                                <button
                                    type="button"
                                    class="ui-btn ui-btn-gradient-primary !rounded-none"
                                    :disabled="processing || saveStatus === 'saved' || !canSaveStack || !validFilenameDraft || !hasUnsavedChanges"
                                    @click="requestDeployStack"
                                >
                                    <font-awesome-icon icon="rocket" />
                                    <span class="action-group-text">{{ $t("deployStack") }}</span>
                                </button>
                                <button
                                    type="button"
                                    class="ui-btn !rounded-none"
                                    :disabled="processing || saveStatus === 'saved' || !canSaveStack || !validFilenameDraft || !hasUnsavedChanges"
                                    @click="saveCurrentFile"
                                >
                                    <font-awesome-icon :icon="saveStatus === 'saving' ? 'spinner' : saveStatus === 'saved' ? 'check' : 'save'" :spin="saveStatus === 'saving'" />
                                    <span class="action-group-text">{{ $t(saveStatus === 'saved' ? 'Saved' : 'saveStackDraft') }}</span>
                                </button>
                            </div>
                            <div class="editor-format-btn flex items-stretch">
                                <button
                                    type="button"
                                    class="ui-btn"
                                    :disabled="processing || formattingYaml || !selectedSchemaLanguage"
                                    :title="$t('formatYaml')"
                                    @click="formatYaml"
                                >
                                    <font-awesome-icon icon="align-left" />
                                    <span class="action-group-text">{{ $t("formatYaml") }}</span>
                                </button>
                            </div>
                            <button
                                v-if="!isAdd"
                                type="button"
                                class="editor-edit editor-discard"
                                :disabled="processing"
                                @click="discardStack"
                            >
                                {{ $t("discardStack") }}
                            </button>
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
                v-model="showDeleteFileDialog"
                size="sm"
                :title="$t('confirmDelete')"
                :ok-title="$t('deleteEditableFile')"
                ok-variant="danger"
                :cancel-title="$t('cancel')"
                :busy="processing"
                @update:model-value="onDeletionDialogVisibilityChange"
                @ok="confirmStagedDeletions"
                @cancel="pendingDeletionAction = null"
                @hidden="clearPendingDeletionAction"
            >
                {{ $t('confirmDeleteEditableFiles', { names: stagedDeletedFiles.join(', ') }) }}
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
import { json } from "@codemirror/lang-json";
import { SchemaLanguageClient } from "../editor/schema-client";
import { schemaLoader, resolveSchemaReference } from "../editor/schema-transport";
import { python } from "@codemirror/lang-python";
import { lineNumbers, EditorView, gutter, GutterMarker, keymap } from "@codemirror/view";
import { EditorState, StateField, RangeSetBuilder, Prec } from "@codemirror/state";
import { redo } from "@codemirror/commands";
import { Chunk } from "@codemirror/merge";
import { parseDocument } from "yaml";

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faDocker } from "@fortawesome/free-brands-svg-icons";
import { composeLanguageSupport, formatComposeYaml } from "../editor/compose-language";
import { YamlLanguageClient } from "../editor/yaml-client";
import { getEditorTheme } from "../editor/editor-theme";
import {
    DEFAULT_COMPOSE_FILE_PATTERNS,
    DEFAULT_EDITABLE_FILE_PATTERNS,
    matchesFilePatterns,
    envsubstYAML,
    getComposeTerminalName,
    validateStackFolderName,
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

class ChangeMarker extends GutterMarker {
    constructor(kind) {
        super();
        this.kind = kind;
        this.elementClass = `cm-diff-marker cm-diff-${kind}`;
    }
}

const addedMarker = new ChangeMarker("added");
const deletedMarker = new ChangeMarker("deleted");
const redoShortcut = Prec.highest(keymap.of([{ key: "Ctrl-Shift-z", run: redo, preventDefault: true }]));

/** Diff the saved version against the current document without changing editor content. */
function changeGutter(original, onClick) {
    const saved = EditorState.create({ doc: original }).doc;
    const chunks = StateField.define({
        create(state) {
            return Chunk.build(saved, state.doc);
        },
        update(value, transaction) {
            return transaction.docChanged ? Chunk.updateB(value, saved, transaction.state.doc, transaction.changes) : value;
        },
    });
    const markers = StateField.define({
        create(state) {
            return buildMarkers(state, state.field(chunks));
        },
        update(value, transaction) {
            return transaction.docChanged ? buildMarkers(transaction.state, transaction.state.field(chunks)) : value;
        },
    });
    function buildMarkers(state, changes) {
        const builder = new RangeSetBuilder();
        const positions = new Map();
        for (const chunk of changes) {
            if (chunk.toB > chunk.fromB) {
                const start = state.doc.lineAt(Math.min(chunk.fromB, state.doc.length)).number;
                const end = state.doc.lineAt(Math.min(Math.max(chunk.fromB, chunk.toB - 1), state.doc.length)).number;
                for (let number = start; number <= end; number++) {
                    positions.set(state.doc.line(number).from, addedMarker);
                }
            } else {
                const position = state.doc.lineAt(Math.min(chunk.fromB, state.doc.length)).from;
                positions.set(position, deletedMarker);
            }
        }
        for (const [ position, marker ] of [ ...positions ].sort(([ a ], [ b ]) => a - b)) {
            builder.add(position, position, marker);
        }
        return builder.finish();
    }
    return [
        chunks,
        markers,
        gutter({
            class: "cm-diff-gutter",
            markers: view => view.state.field(markers),
            domEventHandlers: {
                mousedown(view, line, event) {
                    if (!event.target.closest(".cm-diff-marker")) {
                        return false;
                    }
                    const chunk = view.state.field(chunks).find(change =>
                        change.toB > change.fromB
                            ? line.from >= view.state.doc.lineAt(Math.min(change.fromB, view.state.doc.length)).from
                                && line.from <= view.state.doc.lineAt(Math.min(Math.max(change.fromB, change.toB - 1), view.state.doc.length)).from
                            : line.from === view.state.doc.lineAt(Math.min(change.fromB, view.state.doc.length)).from);
                    if (chunk) {
                        event.preventDefault();
                        onClick(view, chunk, saved);
                    }
                    return true;
                },
            },
        }),
    ];
}

const template = `services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
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
let copyResetTimeout = null;

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
            redoShortcut,
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        return {
            faDocker,
            baseExtensions,
            envBaseExtensions: [ python(), lineNumbers(), redoShortcut, EditorView.focusChangeEffect.of(focusEffectHandler) ],
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
            selectedFile: "compose.yaml",
            filenameDraft: "compose.yaml",
            renamingFile: null,
            addingFile: false,
            newFileName: "",
            editableFiles: [],
            editableFilesOnDisk: [],
            fileContents: {},
            savedFileContents: {},
            savedComposeContent: "",
            savedComposeENV: "",
            savedComposeFileName: "",
            diffPopup: null,
            diffPopupStyle: {},
            otherFileContent: "",
            savedOtherFileContent: "",
            draftFiles: {},
            composeFilePatterns: DEFAULT_COMPOSE_FILE_PATTERNS,
            editableFilePatterns: DEFAULT_EDITABLE_FILE_PATTERNS,
            schemaClient: null,
            schemaClientKey: "",
            serviceStatusList: {},
            dockerStats: {},
            isEditMode: false,
            saveStatus: "idle",
            fileCopied: false,
            showDeleteFileDialog: false,
            stagedDeletedFiles: [],
            pendingDeletionAction: null,
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
        editorContent: {
            get() {
                return this.selectedFile === this.stack.composeFileName ? this.stack.composeYAML : (this.isAdd ? this.draftFiles[this.selectedFile] ?? "" : this.fileContents[this.selectedFile] ?? "");
            },
            set(value) {
                if (this.selectedFile === this.stack.composeFileName) {
                    this.stack.composeYAML = value;
                } else if (this.isAdd) {
                    this.draftFiles[this.selectedFile] = value;
                    if (this.selectedFile === ".env") {
                        this.stack.composeENV = value;
                    }
                } else {
                    this.fileContents[this.selectedFile] = value;
                    this.otherFileContent = value;
                }
            },
        },
        validComposeFileName() {
            return matchesFilePatterns(this.stack.composeFileName, this.composeFilePatterns);
        },
        validFilenameDraft() {
            if (!this.renamingFile) {
                return true;
            }
            const patterns = this.renamingFile === this.stack.composeFileName ? this.composeFilePatterns : this.editableFilePatterns;
            return matchesFilePatterns(this.filenameDraft, patterns);
        },
        validNewFileName() {
            return matchesFilePatterns(this.newFileName.trim(), this.editableFilePatterns)
                && this.newFileName.trim() !== this.stack.composeFileName
                && !this.editableFiles.includes(this.newFileName.trim());
        },
        diffExtensions() {
            if (this.isAdd) {
                return [];
            }
            const original = this.selectedFile === this.stack.composeFileName
                ? this.savedComposeContent : this.savedFileContents[this.selectedFile];
            return original === undefined ? [] : changeGutter(original, (view, chunk, saved) => this.openDiffPopup(view, chunk, saved));
        },
        selectedSchemaLanguage() {
            return /\.ya?ml$/i.test(this.selectedFile) ? "yaml" : /\.json$/i.test(this.selectedFile) ? "json" : null;
        },
        schemaExtensions() {
            return this.getSchemaExtensions();
        },
        envExtensions() {
            return [ getEditorTheme(this.$root.isDark), ...this.envBaseExtensions, ...this.diffExtensions ];
        },
        extensions() {
            return [ getEditorTheme(this.$root.isDark), ...this.baseExtensions, ...this.diffExtensions ];
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
            if (!this.validComposeFileName) {
                return false;
            }
            if (!this.isAdd) {
                return true;
            }
            try {
                validateStackFolderName(this.stack.name);
                return true;
            } catch {
                return false;
            }
        },

        hasUnsavedChanges() {
            return this.isAdd
                || this.stagedDeletedFiles.length > 0
                || this.fileHasPendingChanges(this.stack.composeFileName)
                || this.editableFiles.some(file => this.fileHasPendingChanges(file));
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
        "$root.loggedIn"(loggedIn) {
            if (loggedIn && !this.isAdd && this.processing && !this.stack.composeFileName) {
                this.loadStack();
            }
        },
        selectedFile() {
            clearTimeout(copyResetTimeout);
            this.fileCopied = false;
            this.$nextTick(() => {
                const tabs = this.$refs.fileTabs;
                const active = tabs?.querySelector(".editor-file-tab.active");
                if (active && tabs) {
                    const left = active.offsetLeft - tabs.offsetLeft;
                    if (left < tabs.scrollLeft) {
                        tabs.scrollTo({ left, behavior: "smooth" });
                    } else if (left + active.offsetWidth > tabs.scrollLeft + tabs.clientWidth) {
                        tabs.scrollTo({ left: left + active.offsetWidth - tabs.clientWidth, behavior: "smooth" });
                    }
                }
            });
        },
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
        document.addEventListener("keydown", this.onEditorEscape);
        document.addEventListener("pointerdown", this.onOutsideDiffClick);
        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML = template;
            let composeENV = this.$root.envTemplate || "";
            this.$root.envTemplate = "";

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                composeFileName: "compose.yaml",
                isManagedByDockge: true,
                endpoint: "",
            };

            this.selectedFile = this.stack.composeFileName;
            this.filenameDraft = this.selectedFile;
            this.editableFiles = [ ".env" ];
            this.draftFiles = { ".env": composeENV };
            this.yamlCodeChange();

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        this.requestDockerStats();
    },
    beforeUnmount() {
        clearTimeout(copyResetTimeout);
        this.schemaClient?.dispose();
        this.disposeYamlClient();
        document.removeEventListener("keydown", this.onEditorEscape);
        document.removeEventListener("pointerdown", this.onOutsideDiffClick);
    },
    methods: {
        fileHasPendingChanges(file) {
            if (file === this.stack.composeFileName) {
                return this.isAdd || this.stack.composeYAML !== this.savedComposeContent || this.stack.composeFileName !== this.savedComposeFileName;
            }
            if (this.stagedDeletedFiles.includes(file)) {
                return false;
            }
            if (this.isAdd) {
                return !this.editableFilesOnDisk.includes(file) || this.draftFiles[file] !== "";
            }
            return !this.editableFilesOnDisk.includes(file)
                || (file === ".env" && this.stack.composeENV !== this.savedComposeENV)
                || (Object.hasOwn(this.fileContents, file) && this.fileContents[file] !== this.savedFileContents[file]);
        },
        onFileTabsWheel(event) {
            const tabs = this.$refs.fileTabs;
            if (!tabs || tabs.scrollWidth <= tabs.clientWidth) {
                return;
            }
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if ((delta < 0 && tabs.scrollLeft > 0) || (delta > 0 && tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1)) {
                event.preventDefault();
                tabs.scrollLeft += delta;
            }
        },
        getSchemaExtensions() {
            const language = this.selectedSchemaLanguage;
            if (!language || !this.stack.name) {
                return this.selectedFile === this.stack.composeFileName ? this.extensions : this.envExtensions;
            }
            const projectDir = this.stack.projectDir || `/stacks/${this.stack.name}`;
            const key = `${this.endpoint}:${this.stack.name}:${projectDir}:${this.selectedFile}:${language}`;
            if (this.schemaClientKey !== key) {
                this.schemaClient?.dispose();
                const documentUri = new URL(`./${encodeURIComponent(this.selectedFile)}`, `file://${projectDir.replace(/\/$/, "")}/`).href;
                const emit = (event, request, callback) => this.$root.emitAgent(this.endpoint, event, request, callback);
                this.schemaClient = markRaw(new SchemaLanguageClient({
                    language,
                    documentUri,
                    compose: this.selectedFile === this.stack.composeFileName,
                    loadSchema: schemaLoader(emit, { source: "stack", stackName: this.stack.name, filename: this.selectedFile }),
                    resolveReference: resolveSchemaReference,
                }));
                this.schemaClientKey = key;
            }
            return [ getEditorTheme(this.$root.isDark), language === "yaml" ? yaml() : json(),
                composeLanguageSupport(this.schemaClient, language), lineNumbers(), redoShortcut,
                EditorView.focusChangeEffect.of((state, focusing) => {
                    this.editorFocus = focusing;
                    return null;
                }), ...this.diffExtensions ];
        },
        statusColor,

        openDiffPopup(view, chunk, saved) {
            const before = saved.sliceString(chunk.fromA, chunk.endA);
            const after = view.state.doc.sliceString(chunk.fromB, chunk.endB);
            const editor = view.dom.closest(".editor-box");
            const rect = editor.getBoundingClientRect();
            const marker = view.coordsAtPos(Math.min(chunk.fromB, view.state.doc.length));
            this.diffPopup = {
                before,
                after,
                file: this.selectedFile,
                from: chunk.fromB,
                to: Math.min(chunk.toB, view.state.doc.length),
                replacement: saved.sliceString(chunk.fromA, Math.min(chunk.toA, saved.length)),
            };
            this.diffPopupStyle = {
                top: `${Math.max(34, Math.min((marker?.bottom ?? rect.top) - rect.top, rect.height - 160))}px`,
                left: `${Math.max(40, Math.min((marker?.left ?? rect.left) - rect.left, rect.width - 420))}px`,
            };
        },

        revertDiffChange() {
            const change = this.diffPopup;
            const view = this.$refs.editor?.view;
            if (!change || !view || !this.isEditMode || this.processing || change.file !== this.selectedFile) {
                return;
            }
            view.dispatch({
                changes: { from: change.from, to: change.to, insert: change.replacement },
            });
            this.diffPopup = null;
        },

        onEditorEscape(event) {
            if (event.key !== "Escape" || !this.$refs.editor?.view?.hasFocus) {
                return;
            }
            this.diffPopup = null;
            this.$refs.editor.view.contentDOM.blur();
            event.preventDefault();
        },

        onOutsideDiffClick(event) {
            if (this.diffPopup && !event.target.closest(".cm-diff-gutter, .editor-diff-popup")) {
                this.diffPopup = null;
            }
        },

        onEditorChange() {
            this.diffPopup = null;
            if (this.selectedFile === this.stack.composeFileName) {
                this.yamlCodeChange();
            }
        },

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
            if (!this.$root.loggedIn) {
                return;
            }
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getStack", this.stack.name, (res) => {
                if (res.ok) {
                    this.diffPopup = null;
                    this.stack = res.stack;
                    this.savedComposeContent = res.stack.composeYAML;
                    this.savedComposeENV = res.stack.composeENV;
                    this.savedComposeFileName = res.stack.composeFileName;
                    this.selectedFile = res.stack.composeFileName;
                    this.filenameDraft = this.selectedFile;
                    this.editableFilesOnDisk = res.files;
                    this.editableFiles = res.files;
                    this.stagedDeletedFiles = [];
                    this.fileContents = {};
                    this.savedFileContents = {};
                    this.composeFilePatterns = res.composeFilePatterns;
                    this.editableFilePatterns = res.editableFilePatterns;
                    this.yamlCodeChange();
                    this.processing = false;
                } else {
                    this.processing = false;
                    this.$root.toastRes(res);
                }
            });
        },

        /** Save changed additional files before saving Compose and .env. */
        saveEditedFiles(onSaved, onError) {
            if (this.isAdd) {
                onSaved();
                return;
            }

            const pendingFiles = Object.entries(this.fileContents).filter(([ file, content ]) =>
                !this.stagedDeletedFiles.includes(file)
                && (!this.editableFilesOnDisk.includes(file) || (file !== ".env" && content !== this.savedFileContents[file])));
            const saveNextFile = () => {
                const next = pendingFiles.shift();
                if (!next) {
                    if (!this.stagedDeletedFiles.includes(".env") && Object.hasOwn(this.fileContents, ".env")) {
                        this.stack.composeENV = this.fileContents[".env"];
                    }
                    onSaved();
                    return;
                }
                const [ file, content ] = next;
                const create = !this.editableFilesOnDisk.includes(file);
                this.$root.emitAgent(this.endpoint, "writeStackFile", this.stack.name, file, content, create, (res) => {
                    if (!res?.ok) {
                        onError(res);
                        return;
                    }
                    this.editableFilesOnDisk = res.files;
                    this.savedFileContents[file] = content;
                    saveNextFile();
                });
            };
            saveNextFile();
        },

        /** Apply confirmed removals before saving or deploying; retain failed removals for retry. */
        applyStagedDeletions(onDone, onError) {
            const pending = [ ...this.stagedDeletedFiles ];
            const removeNext = () => {
                const file = pending.shift();
                if (!file) {
                    onDone();
                    return;
                }
                if (this.isAdd || !this.editableFilesOnDisk.includes(file)) {
                    delete this.draftFiles[file];
                    this.finishDeletedFile(file);
                    removeNext();
                    return;
                }
                this.$root.emitAgent(this.endpoint, "deleteStackFile", this.stack.name, file, (res) => {
                    if (!res?.ok) {
                        onError(res);
                        return;
                    }
                    this.editableFilesOnDisk = res.files;
                    this.finishDeletedFile(file);
                    removeNext();
                });
            };
            removeNext();
        },

        finishDeletedFile(file) {
            this.stagedDeletedFiles = this.stagedDeletedFiles.filter(name => name !== file);
            this.editableFiles = this.editableFiles.filter(name => name !== file);
            delete this.fileContents[file];
            delete this.savedFileContents[file];
            if (file === ".env") {
                this.stack.composeENV = "";
            }
            if (this.selectedFile === file) {
                this.selectedFile = this.stack.composeFileName;
                this.filenameDraft = this.selectedFile;
                this.otherFileContent = "";
            }
        },

        deployStack() {
            const draftFiles = this.isAdd ? Object.fromEntries(Object.entries(this.draftFiles).filter(([ file ]) => file !== ".env" && !this.stagedDeletedFiles.includes(file))) : {};
            this.runWithProgress("deployStack", () => {
                this.saveEditedFiles(() => {
                    this.applyStagedDeletions(() => {
                        this.$root.emitAgent(this.stack.endpoint, "deployStack", this.stack.name, this.composeEditorContent(), this.stack.composeENV, this.isAdd, this.stack.composeFileName, draftFiles, (res) => {
                            this.finishProgress(res);

                            if (res.ok) {
                                this.stack.name = res.name;
                                this.savedComposeContent = this.stack.composeYAML;
                                this.savedComposeENV = this.stack.composeENV;
                                this.savedComposeFileName = this.stack.composeFileName;
                                this.isEditMode = false;
                                this.clearProgressCloseTimer();
                                this.showProgressDialog = false;
                                this.$router.push(this.url);
                            }
                        });
                    }, res => this.finishProgress(res));
                }, res => this.finishProgress(res));
            }, [ "docker compose up -d --remove-orphans" ]);
        },

        /**
         * Validate the compose file, then open the deploy confirmation dialog.
         * Deploy saves compose YAML, .env, and edited additional files before running Compose.
         * @returns {void}
         */
        requestDeployStack() {
            if (!this.canSaveStack || !this.validFilenameDraft || this.filenameDraft !== this.selectedFile || !this.hasUnsavedChanges || this.processing || this.saveStatus === "saved") {
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

            if (this.stagedDeletedFiles.length) {
                this.pendingDeletionAction = "deployStack";
                this.showDeleteFileDialog = true;
            } else {
                this.requestProjectAction("deployStack");
            }
        },

        /** Return the editor document verbatim, including comments and trailing newline. */
        composeEditorContent() {
            return this.stack.composeYAML;
        },

        saveCurrentFile() {
            if (this.processing || this.saveStatus === "saved" || !this.canSaveStack || !this.hasUnsavedChanges) {
                return;
            }
            if (this.filenameDraft !== this.selectedFile) {
                this.$root.toastError(this.$t("saveFilenameFirst"));
                return;
            }
            if (this.stagedDeletedFiles.length) {
                this.pendingDeletionAction = "saveStack";
                this.showDeleteFileDialog = true;
            } else {
                this.saveStack();
            }
        },

        beginRename(file) {
            if (this.stagedDeletedFiles.includes(file)) {
                return;
            }
            this.renamingFile = file;
            this.filenameDraft = file;
            this.$nextTick(() => this.$refs.filenameInput?.[0]?.focus());
        },

        resetFilename() {
            this.filenameDraft = this.selectedFile;
            this.renamingFile = null;
        },

        commitFilename() {
            if (!this.renamingFile) {
                return;
            }
            const oldFilename = this.renamingFile;
            const filename = this.filenameDraft.trim();
            if (!matchesFilePatterns(filename, oldFilename === this.stack.composeFileName ? this.composeFilePatterns : this.editableFilePatterns)) {
                this.resetFilename();
                return;
            }
            if (filename === oldFilename) {
                this.filenameDraft = filename;
                this.renamingFile = null;
                return;
            }
            if (filename === this.stack.composeFileName || this.editableFiles.includes(filename)) {
                this.$root.toastError("File already exists");
                this.resetFilename();
                return;
            }
            if (this.isAdd) {
                if (this.selectedFile === this.stack.composeFileName) {
                    this.stack.composeFileName = filename;
                } else {
                    if (oldFilename === ".env") {
                        this.stack.composeENV = "";
                    }
                    if (filename === ".env") {
                        this.stack.composeENV = this.draftFiles[this.selectedFile];
                    }
                    this.draftFiles[filename] = this.draftFiles[this.selectedFile];
                    delete this.draftFiles[this.selectedFile];
                    this.editableFiles = this.editableFiles.map(file => file === this.selectedFile ? filename : file);
                }
                this.selectedFile = filename;
                this.filenameDraft = filename;
                this.renamingFile = null;
                return;
            }
            if (!this.editableFilesOnDisk.includes(oldFilename) && oldFilename !== this.stack.composeFileName) {
                const content = this.fileContents[oldFilename];
                this.fileContents[filename] = content;
                delete this.fileContents[oldFilename];
                if (oldFilename === ".env") {
                    this.stack.composeENV = "";
                }
                if (filename === ".env") {
                    this.stack.composeENV = content;
                }
                this.editableFiles = this.editableFiles.map(file => file === oldFilename ? filename : file);
                this.selectedFile = filename;
                this.filenameDraft = filename;
                this.renamingFile = null;
                return;
            }
            if (this.processing) {
                return;
            }
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "renameStackFile", this.stack.name, this.selectedFile, filename, (res) => {
                this.processing = false;
                if (!res.ok) {
                    this.$root.toastRes(res);
                    this.resetFilename();
                    return;
                }
                if (this.selectedFile === this.stack.composeFileName) {
                    this.stack.composeFileName = filename;
                    this.savedComposeFileName = filename;
                } else {
                    this.editableFilesOnDisk = res.files;
                    this.editableFiles = res.files;
                    this.fileContents[filename] = this.fileContents[oldFilename] ?? "";
                    this.savedFileContents[filename] = this.savedFileContents[oldFilename] ?? "";
                    if (oldFilename === ".env") {
                        this.stack.composeENV = "";
                    }
                    if (filename === ".env") {
                        this.stack.composeENV = this.savedFileContents[filename];
                    }
                    delete this.fileContents[oldFilename];
                    delete this.savedFileContents[oldFilename];
                }
                this.selectedFile = filename;
                this.filenameDraft = filename;
                this.renamingFile = null;
            });
        },

        chooseFile(filename) {
            this.diffPopup = null;
            if (filename === this.selectedFile) {
                this.beginRename(filename);
                return;
            }
            this.renamingFile = null;
            this.selectedFile = filename;
            this.filenameDraft = filename;
            this.selectProjectFile();
        },

        selectProjectFile() {
            if (this.selectedFile === this.stack.composeFileName) {
                return;
            }
            if (this.isAdd) {
                return;
            }
            if (Object.hasOwn(this.fileContents, this.selectedFile)) {
                this.otherFileContent = this.fileContents[this.selectedFile];
                this.savedOtherFileContent = this.savedFileContents[this.selectedFile] ?? "";
                return;
            }
            const file = this.selectedFile;
            this.$root.emitAgent(this.endpoint, "readStackFile", this.stack.name, file, (res) => {
                if (res.ok) {
                    if (Object.hasOwn(this.fileContents, file)) {
                        return;
                    }
                    this.fileContents[file] = res.content;
                    this.savedFileContents[file] = res.content;
                    if (file === ".env") {
                        this.stack.composeENV = res.content;
                    }
                    if (this.selectedFile === file) {
                        this.otherFileContent = res.content;
                        this.savedOtherFileContent = res.content;
                    }
                } else {
                    this.$root.toastRes(res);
                    if (this.selectedFile === file) {
                        this.selectedFile = this.stack.composeFileName;
                        this.filenameDraft = this.selectedFile;
                    }
                }
            });
        },

        startNewFile() {
            if (this.addingFile) {
                this.$refs.newFileInput?.focus();
                return;
            }
            this.addingFile = true;
            this.newFileName = "";
            this.$nextTick(() => this.$refs.newFileInput?.focus());
        },

        cancelNewFile() {
            this.addingFile = false;
            this.newFileName = "";
        },

        createEditableFile() {
            const filename = this.newFileName.trim();
            if (!filename) {
                this.cancelNewFile();
                return;
            }
            if (!this.validNewFileName) {
                this.$root.toastError(this.$t("filenamePatternInvalid", { patterns: this.editableFilePatterns }));
                this.$refs.newFileInput?.focus();
                return;
            }
            this.editableFiles.push(filename);
            this.selectedFile = filename;
            this.filenameDraft = filename;
            if (this.isAdd) {
                this.draftFiles[filename] = "";
            } else {
                this.fileContents[filename] = "";
                this.otherFileContent = "";
                this.isEditMode = true;
            }
            this.cancelNewFile();
        },

        toggleDeleteEditableFile(file) {
            if (this.processing) {
                return;
            }
            this.resetFilename();
            if (!this.editableFilesOnDisk.includes(file)) {
                delete this.draftFiles[file];
                this.finishDeletedFile(file);
                return;
            }
            if (this.stagedDeletedFiles.includes(file)) {
                this.stagedDeletedFiles = this.stagedDeletedFiles.filter(name => name !== file);
            } else {
                this.stagedDeletedFiles.push(file);
            }
        },

        confirmStagedDeletions() {
            this.showDeleteFileDialog = false;
            if (this.pendingDeletionAction === "saveStack") {
                this.pendingDeletionAction = null;
                this.saveStack();
            }
        },

        onDeletionDialogVisibilityChange(visible) {
            if (!visible) {
                this.pendingDeletionAction = null;
            }
        },

        clearPendingDeletionAction() {
            const action = this.pendingDeletionAction;
            this.pendingDeletionAction = null;
            if (action === "deployStack") {
                this.requestProjectAction(action);
            }
        },

        finishSave() {
            this.processing = false;
            this.saveStatus = "saved";
            setTimeout(() => {
                this.isEditMode = false;
                this.saveStatus = "idle";
                if (this.$route.path !== this.url) {
                    this.$router.push(this.url);
                }
            }, 750);
        },

        saveStack() {
            if (!this.canSaveStack || !this.hasUnsavedChanges || this.processing) {
                return;
            }

            this.processing = true;
            this.saveStatus = "saving";

            const fail = (res) => {
                this.processing = false;
                this.saveStatus = "idle";
                this.$root.toastRes(res);
            };
            this.saveEditedFiles(() => {
                this.applyStagedDeletions(() => {
                    this.$root.emitAgent(this.stack.endpoint, "saveStack", this.stack.name, this.composeEditorContent(), this.stack.composeENV, this.isAdd, this.stack.composeFileName, this.isAdd ? Object.fromEntries(Object.entries(this.draftFiles).filter(([ file ]) => file !== ".env")) : {}, (res) => {
                        if (!res?.ok) {
                            fail(res);
                            return;
                        }

                        this.stack.name = res.name;
                        this.savedComposeContent = this.stack.composeYAML;
                        this.savedComposeENV = this.stack.composeENV;
                        this.savedComposeFileName = this.stack.composeFileName;
                        this.submitted = this.submitted || this.isAdd;
                        this.finishSave();
                    });
                }, fail);
            }, fail);
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
            this.stagedDeletedFiles = [];
            if (this.selectedFile !== this.stack.composeFileName) {
                const file = this.selectedFile;
                this.resetFilename();
                if (this.editableFilesOnDisk.includes(file)) {
                    delete this.fileContents[file];
                    delete this.savedFileContents[file];
                    this.selectProjectFile();
                } else {
                    delete this.draftFiles[file];
                    this.finishDeletedFile(file);
                }
            } else {
                this.loadStack();
            }
            this.isEditMode = false;
        },

        async formatYaml() {
            const view = this.$refs.editor?.view;
            if (!view || this.formattingYaml || !this.selectedSchemaLanguage) {
                return;
            }
            this.formattingYaml = true;
            try {
                if (await formatComposeYaml(view)) {
                    this.editorContent = view.state.doc.toString();
                    if (this.selectedFile === this.stack.composeFileName) {
                        this.yamlCodeChange();
                    }
                }
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

        async copyCurrentFile() {
            try {
                await navigator.clipboard.writeText(this.editorContent);
                clearTimeout(copyResetTimeout);
                this.fileCopied = true;
                copyResetTimeout = setTimeout(() => {
                    this.fileCopied = false;
                    copyResetTimeout = null;
                }, 3000);
            } catch (error) {
                this.$root.toastError(error instanceof Error ? error.message : String(error));
            }
        },

        enableEditMode() {
            this.isEditMode = true;
        },

        checkYAML() {

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
        background-color: var(--secondary);
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

    .stack-name-input {
        position: relative;
    }

    .ui-field {
        font-family: var(--font-mono);

        &::placeholder {
            color: transparent;
        }
    }

    .stack-name-placeholder {
        position: absolute;
        top: 50%;
        left: 0.75rem;
        transform: translateY(-50%);
        pointer-events: none;
        font-family: var(--font-mono);
    }

    .stack-name-placeholder-text {
        color: var(--muted-foreground);
        opacity: 0.5;
    }

    .stack-name-required {
        color: var(--destructive);
        opacity: 0.5;
    }
}

.editor-box {
    display: flex;
    overflow: hidden;
    flex-direction: column;
    padding: 0;
    position: relative;
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
        background-color: var(--card);
    }

    :deep(.cm-gutters) {
        background-color: var(--card);
    }

    :deep(.cm-diff-gutter) {
        width: 7px;
    }

    :deep(.cm-diff-marker) {
        position: relative;
        cursor: pointer;

        &::before {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 1px;
            width: 4px;
            border-radius: 2px;
            background: #2da44e;
            content: "";
        }
    }

    :deep(.cm-diff-deleted::before) {
        top: 0;
        bottom: auto;
        height: 3px;
        background: #e05252;
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
    min-height: 34px;
    margin: 0;
    padding: 0 0.5rem 0 0;
    background: var(--secondary);
    box-shadow: inset 0 -1px 0 var(--border);
}

.editor-diff-popup {
    position: absolute;
    z-index: 20;
    width: min(420px, calc(100% - 48px));
    max-height: 280px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    box-shadow: 0 8px 24px rgb(0 0 0 / 20%);
    font-family: var(--font-mono);
    font-size: var(--text-sm-fontSize);
}

.editor-diff-popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0.65rem;
    border-bottom: 1px solid var(--border);
    color: var(--muted-foreground);

    button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: none;
        color: inherit;
        cursor: pointer;

        &:hover:not(:disabled), &:focus-visible {
            background: var(--hover);
            color: var(--foreground);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
    }
}

.editor-diff-popup-actions {
    display: flex;
    align-items: center;
    gap: 0.2rem;

    svg {
        width: 14px;
        height: 14px;
    }

    svg[data-icon="xmark"] {
        width: 18px;
        height: 18px;
    }
}

.editor-diff-popup pre {
    margin: 0;
    overflow-x: auto;
    padding: 0.4rem 0.65rem;
    white-space: pre-wrap;
    word-break: break-word;
}

.editor-diff-prefix {
    font-weight: bold;
    user-select: none;
}

.editor-diff-removed {
    background: rgb(224 82 82 / 16%);
}

.editor-diff-added {
    background: rgb(45 164 78 / 16%);
}

.editor-tabs-wrap {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    align-items: stretch;
}

.editor-file-tabs {
    display: flex;
    flex: 1 1 auto;
    align-items: stretch;
    min-width: 0;
    min-height: 34px;
    overflow-x: auto;
    overflow-y: hidden;
}

.editor-file-tab {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.1rem;
    min-height: 34px;
    padding: 0 0.55rem;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    color: var(--muted-foreground);

    &.active {
        position: relative;
        z-index: 1;
        border-bottom: 0;
        background: var(--card);
        color: var(--foreground);
    }

    &:hover:not(.active) {
        background: var(--hover);
    }

    &.pending-delete .editor-file-label {
        color: var(--muted-foreground);
        text-decoration: line-through;
        text-decoration-color: var(--destructive);
    }
}

.editor-file-icon {
    flex: none;
    font-size: 0.85rem;
}

.editor-file-dirty {
    color: var(--primary);
    font-size: 1.1rem;
    font-weight: bold;
    line-height: 1;
    text-decoration: none;

    &.is-new {
        font-size: 0.9rem;
    }
}

.editor-file-rename {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
}

.editor-file-name, .editor-tab-close, .editor-tab-add {
    flex: none;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.editor-file-name {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0;
    font: inherit;
    font-size: var(--text-sm-fontSize);
    white-space: nowrap;
}

.editor-file-tab.active .editor-file-name:hover .editor-file-label {
    text-decoration: underline;
    text-underline-offset: 3px;
}

.editor-tab-close, .editor-tab-add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 3px;
    font-size: 1.1rem;
    line-height: 1;

    &:hover, &:focus-visible {
        background: var(--hover);
        color: var(--foreground);
    }
}

.editor-tab-close {
    margin-left: 0.15rem;
}

.editor-tab-add {
    flex: 0 0 28px;
    align-self: center;
    margin-left: 0;
    color: var(--foreground);
}

.editor-filename-wrap {
    display: inline-grid;
    flex: none;
    align-items: center;
    min-width: 2ch;

    .editor-filename-measure, .editor-filename-input {
        grid-area: 1 / 1;
        font: inherit;
        font-size: var(--text-sm-fontSize);
        line-height: inherit;
        letter-spacing: inherit;
        box-sizing: border-box;
    }
}

.editor-filename-measure {
    visibility: hidden;
    white-space: pre;
    padding: 0.3rem 0;
}

.editor-filename-input {
    width: 100%;
    min-width: 0;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    outline: none;
    box-shadow: none;
    appearance: none;

    &:focus, &:focus-visible {
        border: 0;
        background: transparent;
        color: inherit;
        outline: none;
        box-shadow: none;
    }

    &[aria-invalid="true"] {
        color: var(--destructive);
    }
}

.editor-edit {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 32px;
    padding: 0.35rem 0.6rem;
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

    .ui-btn, .editor-edit {
        padding: 0.35rem 0.6rem;
        gap: 0.35rem;
        font-size: var(--text-sm-fontSize);
        font-weight: var(--fontWeight-medium);
        line-height: 1;
    }

    &.editor-view-actions {
        justify-content: flex-end;
    }

    .editor-discard {
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

    .compose-page.stack-view-mode,
    .compose-page.full-page-editor {
        display: flex;
        overflow: hidden;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .stack-view-mode > .stack-content,
    .full-page-editor > .stack-content {
        overflow: hidden;
        flex: 1 1 0;
        min-height: 0;
    }

    .stack-view-mode .compose-column,
    .full-page-editor .compose-column {
        display: flex;
        overflow: hidden;
        flex-direction: column;
        min-height: 0;
    }

    .stack-view-mode .compose-column > .editor-box,
    .full-page-editor .compose-column > .editor-box {
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
        margin-bottom: 0 !important;
    }

    .stack-view-mode .containers-column {
        display: flex;
        overflow-y: auto;
        flex-direction: column;
        min-height: 0;
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
            padding: 0 0.6rem !important;
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
