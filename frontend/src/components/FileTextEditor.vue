<template>
    <div ref="editorHost" class="file-text-editor w-full h-full min-h-0"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { minimalSetup } from "codemirror";
import { getEditorTheme } from "../editor/editor-theme";
import { composeLanguageSupport } from "../editor/compose-language";
import { SchemaLanguageClient } from "../editor/schema-client";
import { schemaLoader, resolveSchemaReference } from "../editor/schema-transport";

const props = defineProps({
    content: { type: String,
        required: true },
    languageSupport: { type: Object,
        default: undefined },
    dark: { type: Boolean,
        default: false },
    schemaOrigin: { type: Object,
        default: undefined },
    emitSchema: { type: Function,
        default: undefined },
});

const editorHost = ref();
const themeCompartment = new Compartment();
const noFocusOutline = EditorView.theme({
    "&.cm-focused": { outline: "none !important" },
    ".cm-content:focus-visible": { outline: "none !important" },
});
let editorView;
let schemaClient;

onMounted(() => {
    const extensions = [
        minimalSetup,
        lineNumbers(),
        keymap.of([ indentWithTab ]),
        noFocusOutline,
        themeCompartment.of(getEditorTheme(props.dark)),
    ];
    if (props.languageSupport) {
        extensions.push(props.languageSupport);
    }
    const language = /\.ya?ml$/i.test(props.schemaOrigin?.path ?? "") ? "yaml" : /\.json$/i.test(props.schemaOrigin?.path ?? "") ? "json" : null;
    if (language && props.emitSchema) {
        schemaClient = new SchemaLanguageClient({
            language,
            documentUri: props.schemaOrigin.documentUri,
            loadSchema: schemaLoader(props.emitSchema, { source: "files", path: props.schemaOrigin.path }),
            resolveReference: resolveSchemaReference,
        });
        extensions.push(composeLanguageSupport(schemaClient, language));
    }

    editorView = new EditorView({
        parent: editorHost.value,
        state: EditorState.create({
            doc: props.content,
            extensions,
        }),
    });
});

watch(() => props.dark, dark => {
    editorView?.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(dark)) });
});

onBeforeUnmount(() => {
    schemaClient?.dispose();
    editorView?.destroy();
    editorView = undefined;
});

defineExpose({
    getValue() {
        return editorView?.state.doc.toString() ?? props.content;
    },
    focus() {
        editorView?.focus();
    },
});
</script>

<style scoped>
.file-text-editor :deep(.cm-editor.cm-focused),
.file-text-editor :deep(.cm-content:focus-visible) {
    outline: none !important;
}
</style>
