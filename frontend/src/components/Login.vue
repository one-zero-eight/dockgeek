<template>
    <div class="flex items-center py-[40px]">
        <div class="m-auto w-full max-w-[330px] p-[15px] text-center">
            <form @submit.prevent="submit">
                <h1 class="mb-[1rem] font-normal">{{ $t("Login") }}</h1>
                <div class="text-left">
                    <label for="login-email" class="mb-1 block text-foreground">Email</label>
                    <input id="login-email" v-model="email" type="email" class="ui-field" autocomplete="email" required>
                </div>
                <div class="mt-4 text-left">
                    <label for="login-password" class="mb-1 block text-foreground">{{ $t("Password") }}</label>
                    <input id="login-password" v-model="password" type="password" class="ui-field" autocomplete="current-password" required>
                </div>
                <button class="ui-btn ui-btn-gradient-primary w-full px-5 text-base mt-4" type="submit" :disabled="processing">{{ $t("Login") }}</button>
                <p v-if="error" role="alert" class="mt-4 text-destructive">{{ error }}</p>
            </form>
        </div>
    </div>
</template>

<script lang="ts">
import { authClient } from "../mixins/socket";
export default {
    data() {
        return { email: "", password: "", processing: false, error: "" };
    },
    methods: {
        async submit() {
            this.processing = true;
            const { error } = await authClient.signIn.email({ email: this.email, password: this.password });
            this.processing = false;
            if (error) {
                this.error = error.message || "Unable to sign in";
                return;
            }
            this.$root.getSocket().disconnect();
            this.$root.getSocket().connect();
        }
    }
};
</script>
