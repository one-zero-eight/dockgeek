<template>
    <div class="flex items-center py-[40px]">
        <div class="m-auto w-full max-w-[330px] p-[15px] text-center">
            <form @submit.prevent="submit">
                <h1 class="text-[1.75rem] mb-[1rem] font-normal" />

                <div v-if="!tokenRequired" class="floating-field relative text-left">
                    <input id="floatingInput" v-model="username" type="text" class="field-control block w-full min-h-[3.625rem] rounded-[.375rem] border border-border bg-input-surface px-[1.3rem] pt-[1.5rem] pb-[.45rem] text-secondary-foreground text-control placeholder:text-transparent focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[1px]" placeholder="Username" autocomplete="username" required>
                    <label for="floatingInput" class="pointer-events-none absolute top-[.35rem] left-[1.3rem] text-muted-foreground text-meta">{{ $t("Username") }}</label>
                </div>

                <div v-if="!tokenRequired" class="floating-field relative text-left mt-[1rem]">
                    <input id="floatingPassword" v-model="password" type="password" class="field-control block w-full min-h-[3.625rem] rounded-[.375rem] border border-border bg-input-surface px-[1.3rem] pt-[1.5rem] pb-[.45rem] text-secondary-foreground text-control placeholder:text-transparent focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[1px]" placeholder="Password" autocomplete="current-password" required>
                    <label for="floatingPassword" class="pointer-events-none absolute top-[.35rem] left-[1.3rem] text-muted-foreground text-meta">{{ $t("Password") }}</label>
                </div>

                <div v-if="tokenRequired">
                    <div class="floating-field relative text-left mt-[1rem]">
                        <input id="otp" v-model="token" type="text" maxlength="6" class="field-control block w-full min-h-[3.625rem] rounded-[.375rem] border border-border bg-input-surface px-[1.3rem] pt-[1.5rem] pb-[.45rem] text-secondary-foreground text-control placeholder:text-transparent focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[1px]" placeholder="123456" autocomplete="one-time-code" required>
                        <label for="otp" class="pointer-events-none absolute top-[.35rem] left-[1.3rem] text-muted-foreground text-meta">{{ $t("Token") }}</label>
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
                <button class="w-full min-h-[2.5rem] cursor-pointer rounded-[.375rem] border border-primary bg-primary bg-gradient-primary px-[1.25rem] py-[.375rem] text-primary-foreground text-control hover:enabled:bg-gradient-primary-active disabled:cursor-not-allowed disabled:opacity-65 focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[2px]" type="submit" :disabled="processing">
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
