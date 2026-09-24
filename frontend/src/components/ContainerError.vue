<template>
    <div v-if="message" class="text-foreground text-sm leading-[1.4]" :class="{ expanded }">
        <span class="[overflow-wrap:anywhere]">{{ expanded ? message : preview }}</span>
        <button
            v-if="canExpand"
            type="button"
            class="ms-[.35rem] inline cursor-pointer select-none bg-transparent p-0 text-muted-foreground text-xs leading-inherit underline underline-offset-[.12em] focus-visible:rounded-[.2rem] focus-visible:outline-[2px] focus-visible:outline-current focus-visible:outline-offset-[2px]"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
        >
            {{ expanded ? $t("showLess") : $t("showMore") }}
        </button>
    </div>
</template>

<script>
import { defineComponent } from "vue";

const PREVIEW_MAX = 96;

/**
 * Prefer the actionable tail of long Docker State.Error strings.
 * @param {string} message Full error
 * @returns {string}
 */
function shortenError(message) {
    const bind = message.match(/Bind for\b.+$/i);
    if (bind) {
        return bind[0];
    }
    const failed = message.match(/[^:]+:\s*([^:]+)$/);
    if (failed && failed[1].trim().length >= 12) {
        return failed[1].trim();
    }
    if (message.length <= PREVIEW_MAX) {
        return message;
    }
    return `${message.slice(0, PREVIEW_MAX - 1)}…`;
}

export default defineComponent({
    props: {
        message: {
            type: String,
            default: "",
        },
    },
    data() {
        return {
            expanded: false,
        };
    },
    computed: {
        preview() {
            return shortenError(this.message);
        },
        canExpand() {
            return this.preview !== this.message;
        },
    },
    watch: {
        message() {
            this.expanded = false;
        },
    },
});
</script>
