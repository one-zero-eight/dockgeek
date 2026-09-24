<template>
    <div class="mb-[1rem] flex w-full">
        <input
            ref="input"
            v-model="model"
            :type="visibility"
            class="field-control min-w-0 min-h-[2.375rem] flex-1 rounded-s-[.375rem] border border-border bg-input-surface px-[.75rem] py-[.375rem] text-secondary-foreground text-base read-only:text-muted-foreground max-[575px]:min-h-[44px]"
            :placeholder="placeholder"
            :maxlength="maxlength"
            :autocomplete="autocomplete"
            :required="required"
            :readonly="readonly"
        >

        <button type="button" class="visibility-button inline-flex min-w-[2.75rem] items-center justify-center rounded-e-[.375rem] bg-transparent text-link cursor-pointer hover:bg-primary hover:text-primary-foreground max-[575px]:min-h-[44px]" :aria-label="visibility === 'password' ? 'Show password' : 'Hide password'" :aria-pressed="visibility === 'text'" @click="visibility === 'password' ? showInput() : hideInput()">
            <font-awesome-icon :icon="visibility === 'password' ? 'eye' : 'eye-slash'" />
        </button>
    </div>
</template>

<script>
export default {
    props: {
        /** The value of the input */
        modelValue: {
            type: String,
            default: ""
        },
        /** A placeholder to use */
        placeholder: {
            type: String,
            default: ""
        },
        /** Maximum length of the input */
        maxlength: {
            type: Number,
            default: 255
        },
        /** Should the field auto complete */
        autocomplete: {
            type: String,
            default: "new-password",
        },
        /** Is the input required? */
        required: {
            type: Boolean
        },
        /** Should the input be read only? */
        readonly: {
            type: String,
            default: undefined,
        },
    },
    emits: [ "update:modelValue" ],
    data() {
        return {
            visibility: "password",
        };
    },
    computed: {
        model: {
            get() {
                return this.modelValue;
            },
            set(value) {
                this.$emit("update:modelValue", value);
            }
        }
    },
    created() {

    },
    methods: {
        /** Show users input in plain text */
        showInput() {
            this.visibility = "text";
        },
        /** Censor users input */
        hideInput() {
            this.visibility = "password";
        },
    }
};
</script>

<style scoped>
.field-control:focus-visible, .visibility-button:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    z-index: 1;
}
</style>
