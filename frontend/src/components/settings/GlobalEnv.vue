<template>
    <div>
        <div v-if="settingsLoaded" class="my-[1.5rem] first:mt-0">
            <form class="my-[1.5rem] first:mt-0" autocomplete="off" @submit.prevent="saveGeneral">
                <div class="panel-box editor-box edit-mode mb-4 font-app-mono text-sm">
                    <code-mirror
                        ref="editor"
                        v-model="settings.globalENV"
                        :extensions="extensionsEnv"
                        minimal
                        wrap="true"
                        :dark="$root.isDark"
                        tab="true"
                        :hasFocus="editorFocus"
                        @change="onChange"
                    />
                </div>

                <div class="my-[1.5rem] first:mt-0">
                    <!-- Save Button -->
                    <div>
                        <button class="ui-settings-save" type="submit" :disabled="saving">
                            <span class="col-start-1 row-start-1" :class="{ invisible: saving || saved }" :aria-hidden="saving || saved">{{ $t("Save") }}</span>
                            <span class="col-start-1 row-start-1 inline-flex items-center justify-center gap-2" :class="{ invisible: !saving }" :aria-hidden="!saving">
                                <font-awesome-icon icon="spinner" :spin="saving" aria-hidden="true" /> {{ $t("Save") }}
                            </span>
                            <span class="col-start-1 row-start-1 inline-flex items-center justify-center gap-2" :class="{ invisible: !saved }" :aria-hidden="!saved">
                                <font-awesome-icon icon="check" aria-hidden="true" /> {{ $t("Saved") }}
                            </span>
                        </button>
                    </div>
                </div>
            </form>
        </div>
    </div>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { python } from "@codemirror/lang-python"; // good enough for .env key=value highlighting
import { lineNumbers, EditorView } from "@codemirror/view";
import { getEditorTheme } from "../../editor/editor-theme";
import { ref } from "vue";

export default {
    name: "GlobalEnv",
    components: {
        CodeMirror,
    },

    data() {
        return {
            saving: false,
            saved: false,
            savedTimer: null,
        };
    },

    setup() {
        const editorFocus = ref(false);

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const baseExtensionsEnv = [
            python(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler),
        ];

        return { editorFocus,
            baseExtensionsEnv };
    },

    computed: {
        extensionsEnv() {
            return [
                getEditorTheme(this.$root.isDark),
                ...this.baseExtensionsEnv,
            ];
        },
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        },
    },

    beforeUnmount() {
        clearTimeout(this.savedTimer);
    },

    methods: {
        /** Save the settings */
        saveGeneral() {
            if (this.saving) {
                return;
            }
            clearTimeout(this.savedTimer);
            this.saved = false;
            this.saving = true;
            this.saveSettings((res) => {
                this.saving = false;
                if (res.ok) {
                    this.saved = true;
                    this.savedTimer = setTimeout(() => {
                        this.saved = false;
                        this.savedTimer = null;
                    }, 3000);
                }
            }, undefined, true);
        },

        onChange() {
            clearTimeout(this.savedTimer);
            this.savedTimer = null;
            this.saved = false;
        },
    },
};
</script>

<style scoped lang="scss">
.editor-box.edit-mode {
    background-color: #f6f8fa !important;

    .dark & {
        background-color: #2c2f38 !important;
    }
}
</style>
