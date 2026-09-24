<template>
    <div class="form-container flex items-center py-10" data-cy="setup-form">
        <div class="form w-full max-w-[330px] p-[15px] m-auto text-center">
            <form @submit.prevent="submit">
                <div>
                    <img width="64" height="64" src="/icon.svg" alt="" />
                    <div class="text-2xl font-bold mt-[5px]">
                        Dockge
                    </div>
                </div>

                <p class="mt-[1rem]">
                    {{ $t("Create your admin account") }}
                </p>

                <div class="floating-field">
                    <select id="language" v-model="$root.language" class="ui-floating-field field-select">
                        <option v-for="(lang, i) in $i18n.availableLocales" :key="`Lang${i}`" :value="lang">
                            {{ $i18n.messages[lang].languageName }}
                        </option>
                    </select>
                    <label for="language">{{ $t("Language") }}</label>
                </div>

                <div class="floating-field mt-[1rem]">
                    <input id="floatingInput" v-model="username" type="text" class="ui-floating-field" :placeholder="$t('Username')" required data-cy="username-input">
                    <label for="floatingInput">{{ $t("Username") }}</label>
                </div>

                <div class="floating-field mt-[1rem]">
                    <input id="floatingPassword" v-model="password" type="password" class="ui-floating-field" :placeholder="$t('Password')" required data-cy="password-input">
                    <label for="floatingPassword">{{ $t("Password") }}</label>
                </div>

                <div class="floating-field mt-[1rem]">
                    <input id="repeat" v-model="repeatPassword" type="password" class="ui-floating-field" :placeholder="$t('Repeat Password')" required data-cy="password-repeat-input">
                    <label for="repeat">{{ $t("Repeat Password") }}</label>
                </div>

                <button class="ui-btn ui-btn-primary w-full mt-[1rem] min-h-[40px] px-5 text-base" type="submit" :disabled="processing" data-cy="submit-setup-form">
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
        font-size: var(--text-sm-fontSize);
        pointer-events: none;
    }
}

.field-select {
    appearance: auto;
}

</style>
