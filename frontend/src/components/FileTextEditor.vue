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

const props = defineProps({
    content: { type: String,
        required: true },
    languageSupport: { type: Object,
        default: undefined },
    dark: { type: Boolean,
        default: false },
});

const editorHost = ref();
const themeCompartment = new Compartment();
const noFocusOutline = EditorView.theme({
    "&.cm-focused": { outline: "none !important" },
    ".cm-content:focus-visible": { outline: "none !important" },
});
let editorView;

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
