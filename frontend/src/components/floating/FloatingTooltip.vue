<template>
    <slot
        name="trigger"
        :trigger-ref="setTriggerRef"
        :trigger-attrs="triggerAttrs"
        :is-open="isOpen"
    />

    <Teleport to="body">
        <Transition name="floating-tooltip">
            <div
                v-if="isOpen"
                :id="panelId"
                ref="floatingEl"
                class="floating-tooltip-panel floating-shadow fixed z-[1090] flex w-max max-w-[min(320px,calc(100vw-16px))] flex-col gap-[0.15rem] rounded-lg border border-border bg-popover px-[0.65rem] py-[0.45rem] text-popover-foreground text-sm leading-[1.35] pointer-events-none"
                :class="panelClass"
                :style="panelStyle"
                role="tooltip"
            >
                <slot />
            </div>
        </Transition>
    </Teleport>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
    autoUpdate,
    flip,
    offset as offsetMiddleware,
    shift,
    useFloating,
} from "@floating-ui/vue";

let tooltipId = 0;

export default {
    name: "FloatingTooltip",
    inheritAttrs: false,
    props: {
        /** Any Floating UI placement, e.g. `top`, `top-start`, `right`. */
        placement: {
            type: String,
            default: "top",
        },
        /** Distance between the trigger and the panel, in pixels. */
        offset: {
            type: Number,
            default: 8,
        },
        disabled: {
            type: Boolean,
            default: false,
        },
        /** Extra class applied to the floating panel (which lives outside of the component root). */
        panelClass: {
            type: String,
            default: "",
        },
    },
    emits: [ "open", "close" ],
    setup(props, { emit, attrs }) {
        const referenceEl = ref(null);
        const floatingEl = ref(null);
        const isOpen = ref(false);
        const panelId = `floating-tooltip-${++tooltipId}`;

        /**
         * Register the consumer-provided trigger element as the floating reference.
         * Keeping the trigger as the consumer's own element avoids wrapping it in an
         * extra node, which would break inline layouts and dot alignment.
         * @param {HTMLElement|null} el Trigger element rendered by the slot.
         * @returns {void}
         */
        function setTriggerRef(el) {
            referenceEl.value = el;
        }

        const middleware = [
            offsetMiddleware(props.offset),
            flip({ padding: 8 }),
            shift({ padding: 8 }),
        ];

        const { floatingStyles, update } = useFloating(referenceEl, floatingEl, {
            placement: computed(() => props.placement),
            strategy: "fixed",
            middleware,
            whileElementsMounted: autoUpdate,
        });

        const panelStyle = computed(() => floatingStyles.value);

        /**
         * Show the tooltip next to the trigger.
         * @returns {void}
         */
        function open() {
            if (props.disabled || isOpen.value) {
                return;
            }
            isOpen.value = true;
            emit("open");
            nextTick(() => update());
        }

        /**
         * Hide the tooltip.
         * @returns {void}
         */
        function close() {
            if (!isOpen.value) {
                return;
            }
            isOpen.value = false;
            emit("close");
        }

        /**
         * Attributes the consumer is expected to spread onto the trigger element.
         * @returns {object}
         */
        const triggerAttrs = computed(() => {
            const { class: attrsClass, ...rest } = attrs;
            return {
                ...rest,
                ref: setTriggerRef,
                class: [ "floating-tooltip-trigger cursor-inherit", attrsClass, { "is-open": isOpen.value }],
                "aria-describedby": isOpen.value ? panelId : undefined,
                onPointerenter: open,
                onPointerleave: close,
                onFocusin: open,
                onFocusout: close,
            };
        });

        function onDocumentPointerDown(event) {
            if (referenceEl.value?.contains(event.target) || floatingEl.value?.contains(event.target)) {
                return;
            }
            close();
        }

        function onDocumentKeydown(event) {
            if (event.key === "Escape") {
                close();
            }
        }

        watch(isOpen, value => {
            if (value) {
                document.addEventListener("pointerdown", onDocumentPointerDown, true);
                document.addEventListener("keydown", onDocumentKeydown);
            } else {
                document.removeEventListener("pointerdown", onDocumentPointerDown, true);
                document.removeEventListener("keydown", onDocumentKeydown);
            }
        });

        onBeforeUnmount(() => {
            document.removeEventListener("pointerdown", onDocumentPointerDown, true);
            document.removeEventListener("keydown", onDocumentKeydown);
        });

        return {
            floatingEl,
            isOpen,
            panelId,
            panelStyle,
            triggerAttrs,
            setTriggerRef,
            open,
            close,
        };
    },
};
</script>

<style lang="scss">
.floating-tooltip-title {
    font-weight: var(--fontWeight-semibold);
}

.floating-tooltip-detail {
    color: var(--muted-foreground);
    font-family: var(--font-mono);
    font-size: var(--text-sm-fontSize);
}

.floating-tooltip-enter-active {
    transition: opacity 0.14s ease, scale 0.14s ease;
}

.floating-tooltip-leave-active {
    transition: opacity 0.1s ease, scale 0.1s ease;
}

.floating-tooltip-enter-from,
.floating-tooltip-leave-to {
    opacity: 0;
    scale: 0.96;
}
</style>
