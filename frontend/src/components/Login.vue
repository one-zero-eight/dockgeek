<template>
    <div class="flex items-center py-[40px]">
        <div class="m-auto w-full max-w-[330px] p-[15px] text-center">
            <p v-if="!emailPassword && !providers.length && !error" role="alert" class="text-destructive">No sign-in methods configured.</p>
            <form v-if="emailPassword" @submit.prevent="submit">
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
            <div v-else class="mb-[1rem] text-2xl">{{ $t("Login") }}</div>
            <div v-if="providers.length" class="flex flex-col gap-3" :class="emailPassword ? 'mt-6' : 'mt-3'">
                <button v-for="provider in providers" :key="provider.id" type="button" class="ui-btn ui-btn-provider w-full px-5 text-base" :disabled="processing" @click="signInWith(provider.id)">
                    {{ $t("Login") }} — {{ provider.label }}
                </button>
            </div>
            <p v-if="!emailPassword && error" role="alert" class="mt-4 text-destructive">{{ error }}</p>
        </div>
    </div>
</template>

<script lang="ts">
import { authClient } from "../mixins/socket";
export default {
    data() {
        return { email: "", password: "", processing: false, error: "", emailPassword: true, providers: [] as { id: string; label: string }[] };
    },
    async mounted() {
        try {
            const response = await fetch("/api/dockgeek/login-options");
            if (!response.ok) {
                throw new Error("Unable to load login options");
            }
            const options = await response.json();
            this.emailPassword = options.emailPassword;
            this.providers = options.providers;
        } catch (error) {
            this.error = error instanceof Error ? error.message : "Unable to load login options";
        }
    },
    methods: {
        async signInWith(provider: string) {
            this.processing = true;
            this.error = "";
            try {
                const { error } = await authClient.signIn.social({ provider, callbackURL: "/" });
                if (error) {
                    this.error = error.message || "Unable to sign in";
                }
            } catch (error) {
                this.error = error instanceof Error ? error.message : "Unable to sign in";
            } finally {
                this.processing = false;
            }
        },
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
