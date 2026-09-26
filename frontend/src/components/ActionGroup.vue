<template>
    <div ref="root" class="action-group action-group--adaptive relative inline-flex min-w-0 flex-nowrap items-stretch overflow-hidden" :class="{ 'is-sm': size === 'sm', 'is-header': size === 'header' }" role="group" :aria-label="ariaLabel">
        <button
            v-for="action in visibleActions"
            :key="action.key"
            type="button"
            class="ui-btn action-group-btn"
            :class="buttonClass(action)"
            :disabled="isDisabled(action)"
            :title="labelFor(action) ? undefined : titleFor(action)"
            @click="select(action)"
        >
            <font-awesome-icon v-if="action.icon" :icon="action.icon" />
            <span v-if="labelFor(action)" class="action-group-text">{{ labelFor(action) }}</span>
        </button>

        <FloatingMenu
            v-if="menuActions.length"
            :panel-class="menuPanelClass"
            :placement="placement"
            :disabled="disabled"
        >
            <template #trigger="{ triggerAttrs }">
                <button
                    v-bind="triggerAttrs"
                    type="button"
                    class="ui-btn action-group-btn action-group-more"
                    :disabled="disabled"
                    :aria-label="moreLabel || $t('actions')"
                >
                    <font-awesome-icon icon="ellipsis" />
                </button>
            </template>

            <template v-for="(action, index) in menuActions" :key="action.key">
                <div v-if="action.separatorBefore && index > 0" class="floating-menu-divider" />

                <button
                    type="button"
                    role="menuitem"
                    class="ui-btn floating-menu-item"
                    :class="{
                        'is-danger': isDanger(action),
                        'is-warning': isWarning(action),
                    }"
                    :disabled="isDisabled(action)"
                    @click="select(action)"
                >
                    <font-awesome-icon v-if="action.icon" :icon="action.icon" />
                    {{ labelFor(action) }}
                </button>
            </template>
        </FloatingMenu>

        <!-- Invisible copies used to measure natural widths before deciding what fits -->
        <div ref="measure" class="absolute top-0 left-0 flex w-max flex-nowrap invisible pointer-events-none" aria-hidden="true">
            <button
                v-for="action in candidates"
                :key="action.key"
                type="button"
                tabindex="-1"
                class="ui-btn action-group-btn"
                :class="buttonClass(action)"
            >
                <font-awesome-icon v-if="action.icon" :icon="action.icon" />
                <span v-if="labelFor(action)" class="action-group-text">{{ labelFor(action) }}</span>
            </button>
            <button type="button" tabindex="-1" class="ui-btn action-group-btn action-group-more">
                <font-awesome-icon icon="ellipsis" />
            </button>
        </div>
    </div>
</template>

<script>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import FloatingMenu from "./floating/FloatingMenu.vue";

/**
 * A row of buttons that degrades into an overflow menu.
 *
 * The component measures the space it was given, shows as many actions as fit
 * (never more than `maxVisible`) and moves the rest into a `…` menu.
 *
 * @typedef {object} ActionGroupItem
 * @property {string}  key                Unique id, emitted by the `select` event.
 * @property {string}  [icon]             Font Awesome icon name.
 * @property {string}  [label]            Ready to use label, takes precedence over `i18nKey`.
 * @property {string}  [i18nKey]          Translation key of the label.
 * @property {string}  [variant]          Button variant (`primary`, `warning`, etc.); defaults to neutral.
 * @property {boolean} [danger]           Color the label crimson (row + menu), keep normal chrome.
 * @property {boolean} [warning]          Color the label amber (row + menu), keep normal chrome.
 * @property {boolean} [disabled]         Disable this single action.
 * @property {boolean} [menuOnly]         Never render in the row, always keep it in the menu.
 * @property {boolean} [hidden]           Skip the action entirely.
 * @property {boolean} [separatorBefore]  Draw a divider above it inside the menu.
 */
export default {
    name: "ActionGroup",
    components: {
        FontAwesomeIcon,
        FloatingMenu,
    },
    props: {
        /** Actions to render, in the order they should be considered for the row. @type {ActionGroupItem[]} */
        actions: {
            type: Array,
            default: () => [],
        },
        /** Upper bound of buttons rendered outside of the overflow menu. */
        maxVisible: {
            type: Number,
            default: 3,
        },
        /** Disable every action. */
        disabled: {
            type: Boolean,
            default: false,
        },
        /** Floating UI placement of the overflow menu. */
        placement: {
            type: String,
            default: "bottom-end",
        },
        /** Accessible name of the overflow menu trigger. */
        moreLabel: {
            type: String,
            default: "",
        },
        /** Accessible name of the button row. */
        ariaLabel: {
            type: String,
            default: "",
        },
        /** `header` fits project titles; `sm` is denser for service cards. */
        size: {
            type: String,
            default: "md",
            validator: value => [ "md", "header", "sm" ].includes(value),
        },
    },
    emits: [ "select" ],
    data() {
        return {
            // Optimistic until the first measurement, avoids a flash of an empty row
            fitCount: this.maxVisible,
        };
    },
    computed: {
        allActions() {
            return this.actions.filter(action => !action.hidden);
        },
        candidates() {
            return this.allActions.filter(action => !action.menuOnly);
        },
        pinnedActions() {
            return this.allActions.filter(action => action.menuOnly);
        },
        visibleActions() {
            return this.candidates.slice(0, this.fitCount);
        },
        menuActions() {
            return [
                ...this.candidates.slice(this.fitCount),
                ...this.pinnedActions,
            ];
        },
        menuPanelClass() {
            return `action-group-menu${this.size === "md" ? "" : ` is-${this.size}`}`;
        },
    },
    watch: {
        candidates() {
            this.$nextTick(() => this.updateFit());
        },
        pinnedActions() {
            this.$nextTick(() => this.updateFit());
        },
        maxVisible() {
            this.$nextTick(() => this.updateFit());
        },
        "$i18n.locale"() {
            this.$nextTick(() => this.updateFit());
        },
    },
    mounted() {
        this.updateFit();

        this.resizeObserver = new ResizeObserver(() => this.updateFit());
        this.resizeObserver.observe(this.$refs.root);

        // Web fonts change the width of the labels
        document.fonts?.ready?.then(() => this.updateFit());
    },
    beforeUnmount() {
        this.resizeObserver?.disconnect();
    },
    methods: {
        /**
         * Decide how many actions fit into the available width.
         * @returns {void}
         */
        updateFit() {
            const root = this.$refs.root;
            const measure = this.$refs.measure;
            if (!root || !measure || !this.candidates.length) {
                this.fitCount = 0;
                return;
            }

            const available = root.clientWidth;
            if (!available) {
                return;
            }

            // The last clone is the ellipsis trigger
            const widths = [ ...measure.children ].map(el => el.getBoundingClientRect().width);
            const ellipsisWidth = widths.pop();

            let count = 0;
            for (let n = Math.min(this.maxVisible, widths.length); n >= 0; n--) {
                const needsMenu = n < widths.length || this.pinnedActions.length > 0;
                const used = widths.slice(0, n).reduce((sum, w) => sum + w, 0)
                    + (needsMenu ? ellipsisWidth : 0);

                if (used <= available) {
                    count = n;
                    break;
                }
            }

            if (count !== this.fitCount) {
                this.fitCount = count;
            }
        },

        select(action) {
            if (this.isDisabled(action)) {
                return;
            }
            this.$emit("select", action.key);
        },

        buttonClass(action) {
            return {
                "action-group-icon-only": !this.labelFor(action),
                "is-danger": this.isDanger(action),
                "is-warning": this.isWarning(action),
                "is-primary": !this.isDanger(action) && !this.isWarning(action) && action.variant === "primary",
                "is-info": !this.isDanger(action) && !this.isWarning(action) && action.variant === "info",
            };
        },

        isDanger(action) {
            return Boolean(action.danger) || action.variant === "danger";
        },

        isWarning(action) {
            return Boolean(action.warning) || action.variant === "warning";
        },

        isDisabled(action) {
            return this.disabled || Boolean(action.disabled);
        },

        titleFor(action) {
            return action.title ?? this.labelFor(action) ?? "";
        },

        labelFor(action) {
            if (action.label) {
                return action.label;
            }
            return action.i18nKey ? this.$t(action.i18nKey) : "";
        },
    },
};
</script>

<style lang="scss">
.action-group--adaptive {
    > .action-group-btn:first-of-type {
        border-start-start-radius: 0.375rem;
        border-end-start-radius: 0.375rem;
    }

    > .action-group-btn:last-of-type,
    > .floating-menu:last-of-type {
        border-start-end-radius: 0.375rem;
        border-end-end-radius: 0.375rem;
    }

    .action-group-btn {
        box-sizing: border-box;
        flex: 0 0 auto;
        padding: 0.35rem 0.6rem;
        gap: 0.4rem;
        border: 0;
        border-radius: 0;
        appearance: none;
        font-family: inherit;
        font-size: var(--text-base-fontSize);
        font-weight: var(--fontWeight-medium);
        white-space: nowrap;
        line-height: 1;

        &:hover:not(:disabled) {
            background-color: var(--secondary-hover);
        }

        &.is-primary,
        &.is-info {
            color: var(--primary-foreground);
            background: var(--gradient-primary);

            &:hover:not(:disabled) {
                background: var(--gradient-primary-active);
            }
        }

        &.is-danger {
            color: var(--destructive);
        }

        &.is-warning {
            color: var(--warning);
        }

        &:disabled {
            color: var(--muted-foreground);
            opacity: 0.65;
            cursor: not-allowed;
        }

        svg {
            display: block;
            flex: 0 0 1em;
            width: 1em;
            height: 1em;
            margin: 0 !important;
        }

        &:focus-visible {
            outline: 2px solid var(--ring);
            outline-offset: -2px;
        }
    }

    .floating-menu {
        display: inline-flex;
        flex: 0 0 auto;
    }

    .action-group-more {
        width: 32px;
        padding: 0;
    }
}

.action-group-menu.floating-menu-panel {
    min-width: 10rem;
    padding: 0;
    border: 0;
    border-radius: 0.375rem;
    overflow: hidden;
    background-color: var(--secondary);
    color: var(--secondary-foreground);

    .floating-menu-item {
        width: 100%;
        padding: 0.35rem 0.6rem;
        border: 0;
        border-radius: 0;
        background-color: var(--secondary);
        font-size: var(--text-base-fontSize);
        line-height: 1;
        white-space: nowrap;

        &:hover:not(:disabled),
        &:focus-visible {
            background-color: var(--secondary-hover);
        }

        svg {
            display: block;
            flex: 0 0 1em;
            width: 1em;
            height: 1em;
            margin: 0;
        }
    }

    .floating-menu-divider {
        margin: 0;
    }
}

.action-group--adaptive.is-header,
.action-group--adaptive.is-sm {
    .action-group-btn {
        font-size: var(--text-sm-fontSize);
        gap: 0.35rem;
    }
}

.action-group-menu.is-header,
.action-group-menu.is-sm {
    .floating-menu-item {
        font-size: var(--text-sm-fontSize);
        gap: 0.35rem;
    }
}
</style>
