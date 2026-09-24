<template>
    <div class="flex items-center py-[40px]">
        <div class="m-auto w-full max-w-[330px] p-[15px] text-center">
            <form @submit.prevent="submit">
                <h1 class="mb-[1rem] font-normal" />

                <div v-if="!tokenRequired" class="floating-field relative text-left">
                    <input id="floatingInput" v-model="username" type="text" class="ui-floating-field" placeholder="Username" autocomplete="username" required>
                    <label for="floatingInput" class="pointer-events-none absolute top-[.35rem] left-[1.3rem] text-muted-foreground text-sm">{{ $t("Username") }}</label>
                </div>

                <div v-if="!tokenRequired" class="floating-field relative text-left mt-[1rem]">
                    <input id="floatingPassword" v-model="password" type="password" class="ui-floating-field" placeholder="Password" autocomplete="current-password" required>
                    <label for="floatingPassword" class="pointer-events-none absolute top-[.35rem] left-[1.3rem] text-muted-foreground text-sm">{{ $t("Password") }}</label>
                </div>

                <div v-if="tokenRequired">
                    <div class="floating-field relative text-left mt-[1rem]">
                        <input id="otp" v-model="token" type="text" maxlength="6" class="ui-floating-field" placeholder="123456" autocomplete="one-time-code" required>
                        <label for="otp" class="pointer-events-none absolute top-[.35rem] left-[1.3rem] text-muted-foreground text-sm">{{ $t("Token") }}</label>
                    </div>
                </div>

                <div class="my-[1rem] flex justify-center">
                    <div class="inline-flex items-center gap-2">
                        <input id="remember" v-model="$root.remember" type="checkbox" value="remember-me" class="m-0 h-[1rem] w-[1rem] cursor-pointer accent-primary focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[2px]">

                        <label for="remember">
                            {{ $t("Remember me") }}
                        </label>
                    </div>
                </div>
                <button class="ui-btn ui-btn-gradient-primary w-full min-h-[40px] px-5 text-base" type="submit" :disabled="processing">
                    {{ $t("Login") }}
                </button>

                <div v-if="res && !res.ok" class="mt-[1rem] rounded-[.375rem] border border-destructive bg-card px-[1rem] py-[.75rem] text-destructive" role="alert">
                    {{ $t(res.msg) }}
                </div>
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
            token: "",
            res: null,
            tokenRequired: false,
        };
    },

    mounted() {
        document.title += " - Login";
    },

    unmounted() {
        document.title = document.title.replace(" - Login", "");
    },

    methods: {
        /**
         * Submit the user details and attempt to log in
         * @returns {void}
         */
        submit() {
            this.processing = true;

            this.$root.login(this.username, this.password, this.token, (res) => {
                this.processing = false;

                if (res.tokenRequired) {
                    this.tokenRequired = true;
                } else {
                    this.res = res;
                }
            });
        },

    },
};
</script>
