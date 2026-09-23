<template>
    <div v-if="message" class="container-error" :class="{ expanded }">
        <span class="container-error-text">{{ expanded ? message : preview }}</span>
        <button
            v-if="canExpand"
            type="button"
            class="container-error-toggle"
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

<style scoped lang="scss">
@import "../styles/vars";

.container-error {
    font-size: 0.9rem;
    line-height: 1.4;
    color: $dark-font-color;
}

.container-error-text {
    overflow-wrap: anywhere;
}

.container-error-toggle {
    display: inline;
    margin: 0;
    margin-inline-start: 0.35rem;
    padding: 0;
    border: 0;
    background: none;
    font-size: 0.8rem;
    line-height: inherit;
    color: inherit;
    opacity: 0.75;
    text-decoration: underline;
    text-underline-offset: 0.12em;
    cursor: pointer;
    user-select: none;

    &:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
        border-radius: 0.2rem;
    }
}
</style>
