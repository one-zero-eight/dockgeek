<template>
    <div class="form-container flex items-center py-10">
        <form class="form w-full max-w-[330px] p-[15px] m-auto text-center" @submit.prevent="submit">
            <h1 class="text-2xl font-bold">Claim Dockge administrator</h1>
            <p class="mt-4">Use the one-time setup URL printed in the Dockge container logs.</p>
            <input v-if="!signedIn" v-model="name" class="ui-field mt-4" placeholder="Name" required>
            <input v-if="!signedIn" v-model="email" type="email" class="ui-field mt-4" placeholder="Email" autocomplete="email" required>
            <input v-if="!signedIn" v-model="password" type="password" class="ui-field mt-4" placeholder="Password" autocomplete="new-password" required>
            <button class="ui-btn ui-btn-primary w-full mt-4" type="submit" :disabled="processing">{{ signedIn ? "Claim administrator" : "Create account and claim" }}</button>
            <p v-if="error" class="mt-4 text-destructive" role="alert">{{ error }}</p>
        </form>
    </div>
</template>

<script lang="ts">
import { authClient } from "../mixins/socket";
export default {
    data() {
        return { name: "", email: "", password: "", signedIn: false, processing: false, error: "" };
    },
    async mounted() {
        this.signedIn = !!(await authClient.getSession()).data?.user;
    },
    methods: {
        async submit() {
            this.processing = true;
            try {
                if (!this.signedIn) {
                    const { error } = await authClient.signUp.email({ name: this.name, email: this.email, password: this.password });
                    if (error) {
                        throw new Error(error.message || "Unable to create account");
                    }
                }
                const res = await fetch("/api/dockge/claim", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: this.$route.query.claim })
                });
                if (!res.ok) {
                    throw new Error("Invalid or expired claim URL. Check container logs for the latest link.");
                }
                this.$root.getSocket().disconnect();
                this.$root.getSocket().connect();
                this.$router.push("/");
            } catch (error) {
                this.error = error instanceof Error ? error.message : "Unable to claim administrator";
            } finally {
                this.processing = false;
            }
        }
    }
};
</script>
