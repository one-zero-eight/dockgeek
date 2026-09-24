<template>
    <div class="form-container flex items-center py-10" data-cy="setup-form">
        <div class="form w-full max-w-[330px] p-[15px] m-auto text-center">
            <form @submit.prevent="submit">
                <div>
                    <img width="64" height="64" src="/icon.svg" alt="" />
                    <div class="text-[28px] font-bold mt-[5px]">
                        Dockge
                    </div>
                </div>

                <p class="mt-[1rem]">
                    {{ $t("Create your admin account") }}
                </p>

                <div class="floating-field">
                    <select id="language" v-model="$root.language" class="field-control field-select">
                        <option v-for="(lang, i) in $i18n.availableLocales" :key="`Lang${i}`" :value="lang">
                            {{ $i18n.messages[lang].languageName }}
                        </option>
                    </select>
                    <label for="language">{{ $t("Language") }}</label>
                </div>

                <div class="floating-field mt-[1rem]">
                    <input id="floatingInput" v-model="username" type="text" class="field-control" :placeholder="$t('Username')" required data-cy="username-input">
                    <label for="floatingInput">{{ $t("Username") }}</label>
                </div>

                <div class="floating-field mt-[1rem]">
                    <input id="floatingPassword" v-model="password" type="password" class="field-control" :placeholder="$t('Password')" required data-cy="password-input">
                    <label for="floatingPassword">{{ $t("Password") }}</label>
                </div>

                <div class="floating-field mt-[1rem]">
                    <input id="repeat" v-model="repeatPassword" type="password" class="field-control" :placeholder="$t('Repeat Password')" required data-cy="password-repeat-input">
                    <label for="repeat">{{ $t("Repeat Password") }}</label>
                </div>

                <button class="submit-button w-full mt-[1rem]" type="submit" :disabled="processing" data-cy="submit-setup-form">
                    {{ $t("Create") }}
                </button>
            </form>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            processing: false,
            username: "",
            password: "",
            repeatPassword: "",
        };
    },
    watch: {

    },
    mounted() {
        // TODO: Check if it is a database setup

        this.$root.getSocket().emit("needSetup", (needSetup) => {
            if (! needSetup) {
                this.$router.push("/");
            }
        });
    },
    methods: {
        /**
         * Submit form data for processing
         * @returns {void}
         */
        submit() {
            this.processing = true;

            if (this.password !== this.repeatPassword) {
                this.$root.toastError("PasswordsDoNotMatch");
                this.processing = false;
                return;
            }

            this.$root.getSocket().emit("setup", this.username, this.password, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.processing = true;

                    this.$root.login(this.username, this.password, "", () => {
                        this.processing = false;
                        this.$router.push("/");
                    });
                }
            });
        },
    },
};
</script>

<style lang="scss" scoped>
.floating-field {
    position: relative;
    text-align: left;

    > label {
        position: absolute;
        top: 0.35rem;
        left: 1.3rem;
        color: var(--muted-foreground);
        font-size: var(--font-size-meta);
        pointer-events: none;
    }
}

.field-control {
    display: block;
    width: 100%;
    min-height: 3.625rem;
    padding: 1.5rem 1.3rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--input-surface);
    color: var(--secondary-foreground);
    font-size: var(--font-size-control);

    &::placeholder {
        color: transparent;
    }

    &:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 1px;
    }
}

.field-select {
    appearance: auto;
}

.submit-button {
    min-height: 2.5rem;
    padding: 0.375rem 1.25rem;
    border: 1px solid var(--primary);
    border-radius: 0.375rem;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: var(--font-size-control);
    cursor: pointer;

    &:hover:not(:disabled) {
        background: var(--primary-hover);
    }

    &:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
    }

    &:disabled {
        opacity: 0.65;
        cursor: not-allowed;
    }
}

</style>
