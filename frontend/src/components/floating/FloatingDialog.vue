<template>
    <Teleport to="body">
        <Transition name="floating-dialog" @after-leave="onAfterLeave">
            <div
                v-if="modelValue"
                class="floating-dialog-backdrop fixed inset-0 z-[1090]"
                role="presentation"
                @pointerdown.self="onBackdropPointerdown"
            >
                <div
                    ref="floatingEl"
                    class="floating-dialog flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground outline-none"
                    :class="[ `size-${size}`, dialogClass, { 'is-fill': fill, 'is-busy': busy } ]"
                    :style="dialogStyle"
                    role="dialog"
                    aria-modal="true"
                    :aria-label="title"
                    tabindex="-1"
                    @keydown="onDialogKeydown"
                >
                    <header v-if="hasHeader" class="fd-header flex shrink-0 items-center justify-between gap-4 px-[1.15rem] pt-[1.15rem]">
                        <slot name="header">
                            <h5 class="fd-title m-0 overflow-hidden text-ellipsis whitespace-nowrap text-foreground">{{ title }}</h5>
                        </slot>
                        <button v-if="!hideClose" type="button" class="fd-close flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-transparent p-0 text-inherit opacity-70 hover:bg-hover hover:opacity-100 hover:outline-none focus-visible:bg-hover focus-visible:opacity-100 focus-visible:outline-none" :aria-label="$t('close')" @click="cancel">
                            <font-awesome-icon icon="times" />
                        </button>
                    </header>

                    <div class="fd-body min-h-0 flex-auto overflow-auto px-[1.15rem] pt-[0.9rem] pb-[1.15rem] overscroll-contain">
                        <slot />
                    </div>

                    <footer v-if="!hideFooter" class="fd-footer flex shrink-0 flex-wrap items-center justify-end gap-2 px-[1.15rem] pb-[1.15rem]">
                        <slot name="footer" :cancel="cancel" :ok="ok" :busy="busy">
                            <button type="button" class="ui-btn fd-button" :class="buttonVariant(cancelVariant)" :disabled="busy" @click="cancel">
                                {{ cancelTitle || $t("cancel") }}
                            </button>
                            <button type="button" class="ui-btn fd-button fd-ok" :class="buttonVariant(okVariant)" :disabled="okDisabled || busy" @click="ok">
                                <span v-if="busy" class="fd-spinner h-4 w-4 rounded-full border-[0.2em] border-current border-r-transparent" aria-hidden="true" />
                                {{ okTitle || $t("ok") }}
                            </button>
                        </slot>
                    </footer>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { offset, shift, size as sizeMiddleware, useFloating } from "@floating-ui/vue";

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
const VIEWPORT_PADDING = 16;

let openDialogCount = 0;
/** @type {{ cancel: () => void, noCloseOnEsc: boolean }[]} */
const openDialogStack = [];

/**
 * Escape is handled on document (capture) so it still works when focus is inside
 * widgets that swallow keys (e.g. xterm).
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function onDocumentEscape(event) {
    if (event.key !== "Escape") {
        return;
    }
    const top = openDialogStack[openDialogStack.length - 1];
    if (!top || top.noCloseOnEsc) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    top.cancel();
}

document.addEventListener("keydown", onDocumentEscape, true);

/**
 * A dialog anchored with Floating UI to the center of the viewport.
 *
 * The virtual reference is a zero-sized point in the middle of the screen, so the
 * `size` middleware reports exactly how much room is left around it. That keeps the
 * dialog inside the viewport on every screen size without any hardcoded heights.
 */
export default {
    name: "FloatingDialog",
    components: {
        FontAwesomeIcon,
    },
    props: {
        modelValue: {
            type: Boolean,
            default: false,
        },
        title: {
            type: String,
            default: "",
        },
        okTitle: {
            type: String,
            default: "",
        },
        cancelTitle: {
            type: String,
            default: "",
        },
        okVariant: {
            type: String,
            default: "primary",
        },
        cancelVariant: {
            type: String,
            default: "normal",
        },
        /** `sm`, `md`, `lg`, `xl` or `full`. */
        size: {
            type: String,
            default: "md",
        },
        /** Let the dialog grow to the full available viewport height. */
        fill: {
            type: Boolean,
            default: false,
        },
        hideFooter: {
            type: Boolean,
            default: false,
        },
        hideClose: {
            type: Boolean,
            default: false,
        },
        /** Hide the whole header bar (title still used for aria-label when set). */
        hideHeader: {
            type: Boolean,
            default: false,
        },
        noCloseOnBackdrop: {
            type: Boolean,
            default: false,
        },
        noCloseOnEsc: {
            type: Boolean,
            default: false,
        },
        okDisabled: {
            type: Boolean,
            default: false,
        },
        busy: {
            type: Boolean,
            default: false,
        },
        /** Extra class applied to the dialog panel itself. */
        dialogClass: {
            type: String,
            default: "",
        },
    },
    emits: [ "update:modelValue", "ok", "cancel", "shown", "hidden" ],
    setup(props, { emit }) {
        const slots = useSlots();
        const floatingEl = ref(null);
        const isPositioned = ref(false);
        let previouslyFocused = null;

        const virtualReference = computed(() => ({
            getBoundingClientRect() {
                const x = window.innerWidth / 2;
                const y = window.innerHeight / 2;
                return {
                    x,
                    y,
                    width: 0,
                    height: 0,
                    top: y,
                    right: x,
                    bottom: y,
                    left: x,
                };
            },
        }));

        const middleware = computed(() => [
            offset(({ rects }) => ({ mainAxis: -rects.floating.height / 2 })),
            shift({ padding: VIEWPORT_PADDING }),
            sizeMiddleware({
                padding: VIEWPORT_PADDING,
                apply({ availableWidth, availableHeight, elements }) {
                    elements.floating.style.setProperty("--fd-max-width", `${Math.round(availableWidth)}px`);
                    elements.floating.style.setProperty("--fd-max-height", `${Math.round(availableHeight)}px`);
                },
            }),
        ]);

        const { floatingStyles, isPositioned: positioned } = useFloating(virtualReference, floatingEl, {
            placement: "bottom",
            strategy: "fixed",
            middleware,
        });

        watch(positioned, value => {
            isPositioned.value = value;
        });

        const dialogStyle = computed(() => {
            if (!isPositioned.value) {
                return {
                    position: "fixed",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    visibility: "hidden",
                };
            }
            return floatingStyles.value;
        });

        const hasHeader = computed(() => !props.hideHeader && (Boolean(props.title) || Boolean(slots.header)));

        /**
         * All currently focusable elements of the dialog.
         * @returns {Array} List of focusable elements.
         */
        function focusables() {
            if (!floatingEl.value) {
                return [];
            }
            return [ ...floatingEl.value.querySelectorAll(FOCUSABLE_SELECTOR) ]
                .filter(el => el.offsetParent !== null);
        }

        /**
         * Move the initial focus into the dialog once it is rendered.
         * Prefer an autofocused field, then the primary OK control so Enter confirms.
         * @returns {void}
         */
        function focusDialog() {
            const list = focusables();
            const autofocus = floatingEl.value?.querySelector("[autofocus], .fd-body input, .fd-body textarea, .fd-body select");
            const primary = floatingEl.value?.querySelector(".fd-footer .fd-ok:not([disabled]), .fd-footer button:last-of-type:not([disabled])");
            (autofocus || primary || list[0] || floatingEl.value)?.focus();
        }

        // Semantic variants map directly to component-owned classes.
        function buttonVariant(variant) {
            return {
                "fd-primary": variant === "primary" || variant === "info",
                "fd-danger": variant === "danger",
                "fd-warning": variant === "warning",
                "fd-secondary": variant === "secondary",
            };
        }

        function lockScroll() {
            openDialogCount += 1;
            if (openDialogCount === 1) {
                document.body.classList.add("floating-dialog-open");
            }
        }

        function unlockScroll() {
            openDialogCount = Math.max(0, openDialogCount - 1);
            if (openDialogCount === 0) {
                document.body.classList.remove("floating-dialog-open");
            }
        }

        /**
         * Ask the parent to close the dialog.
         * @returns {void}
         */
        function requestClose() {
            emit("update:modelValue", false);
        }

        /**
         * Accept the dialog.
         * @returns {void}
         */
        function ok() {
            if (props.okDisabled || props.busy) {
                return;
            }
            emit("ok");
        }

        /**
         * Dismiss the dialog.
         * @returns {void}
         */
        function cancel() {
            emit("cancel");
            requestClose();
        }

        function onBackdropPointerdown() {
            if (props.noCloseOnBackdrop || props.busy) {
                return;
            }
            requestClose();
        }

        function onDialogKeydown(event) {
            if (event.key === "Enter" && !event.isComposing && !props.hideFooter) {
                const active = document.activeElement;
                const tag = active?.tagName;
                // Let multiline fields and the focused footer button use native behavior.
                if (tag === "TEXTAREA") {
                    return;
                }
                if (tag === "BUTTON" || active?.getAttribute("role") === "button") {
                    return;
                }
                event.preventDefault();
                ok();
                return;
            }

            if (event.key !== "Tab") {
                return;
            }

            const list = focusables();
            if (list.length === 0) {
                event.preventDefault();
                return;
            }

            const first = list[0];
            const last = list[list.length - 1];

            if (event.shiftKey && (document.activeElement === first || document.activeElement === floatingEl.value)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        function onAfterLeave() {
            unlockScroll();
            emit("hidden");
            previouslyFocused?.focus?.();
            previouslyFocused = null;
        }

        watch(() => props.modelValue, async value => {
            if (value) {
                previouslyFocused = document.activeElement;
                lockScroll();
                openDialogStack.push({
                    cancel,
                    get noCloseOnEsc() {
                        return props.noCloseOnEsc;
                    },
                });
                await nextTick();
                focusDialog();
                emit("shown");
            } else {
                const index = openDialogStack.findIndex((entry) => entry.cancel === cancel);
                if (index >= 0) {
                    openDialogStack.splice(index, 1);
                }
            }
        });

        onBeforeUnmount(() => {
            const index = openDialogStack.findIndex((entry) => entry.cancel === cancel);
            if (index >= 0) {
                openDialogStack.splice(index, 1);
            }
            if (props.modelValue) {
                unlockScroll();
            }
        });

        return {
            floatingEl,
            dialogStyle,
            hasHeader,
            buttonVariant,
            ok,
            cancel,
            onBackdropPointerdown,
            onDialogKeydown,
            onAfterLeave,
        };
    },
};
</script>

<style lang="scss">
body.floating-dialog-open {
    overflow: hidden;
}

.floating-dialog-backdrop {
    background-color: var(--overlay);
}

.floating-dialog {
    width: min(var(--fd-width, 520px), var(--fd-max-width, calc(100vw - 32px)));
    max-height: var(--fd-max-height, calc(100vh - 32px));

    &.size-sm {
        --fd-width: 400px;
    }

    &.size-lg {
        --fd-width: 760px;
    }

    &.size-xl {
        --fd-width: 1040px;
    }

    &.size-full {
        --fd-width: 100vw;
        border-radius: 0;
    }

    &.is-fill {
        height: var(--fd-max-height, calc(100vh - 32px));
    }

    &.size-full.is-fill {
        height: 100dvh;
        max-height: 100dvh;
    }
}

.fd-button {
    appearance: none;
    font: inherit;
    line-height: 1.5;

    &:hover:not(:disabled) {
        background-color: var(--secondary-hover);
    }

    &.fd-primary {
        background: var(--gradient-primary);
        color: var(--primary-foreground);

        &:hover:not(:disabled) {
            background: var(--gradient-primary-active);
        }
    }

    &.fd-danger {
        background: var(--gradient-danger);
        color: #fff;

        &:hover:not(:disabled) {
            background: var(--gradient-danger-active);
        }
    }

    &.fd-warning {
        background: var(--gradient-warning);
        color: var(--primary-foreground);

        &:hover:not(:disabled) {
            background: var(--gradient-warning-active);
        }
    }

    &.fd-secondary {
        background-color: var(--muted);
    }
}

.fd-spinner {
    animation: fd-spin 0.75s linear infinite;
}

@keyframes fd-spin {
    to { transform: rotate(360deg); }
}

.floating-dialog-enter-active {
    transition: opacity 0.16s ease;
}

.floating-dialog-leave-active {
    transition: opacity 0.14s ease;
}

.floating-dialog-enter-active .floating-dialog {
    transition: scale 0.16s ease, opacity 0.16s ease;
}

.floating-dialog-leave-active .floating-dialog {
    transition: scale 0.14s ease, opacity 0.14s ease;
}

.floating-dialog-enter-from,
.floating-dialog-leave-to {
    opacity: 0;
}

.floating-dialog-enter-from .floating-dialog {
    opacity: 0;
    scale: 0.96;
}

.floating-dialog-leave-to .floating-dialog {
    opacity: 0;
    scale: 0.98;
}
</style>
