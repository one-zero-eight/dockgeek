<template>
    <div class="flex w-full max-w-[28rem] flex-col gap-5">
        <div class="flex items-center gap-3">
            <strong>{{ $root.username }}</strong>
            <button class="text-destructive cursor-pointer" type="button" @click="$root.logout">{{ $t("Logout") }}</button>
        </div>
        <form class="flex flex-col gap-3" @submit.prevent="changePassword">
            <h3>{{ $t("Change Password") }}</h3>
            <input v-model="currentPassword" type="password" class="ui-field" :placeholder="$t('Current Password')" required>
            <input v-model="newPassword" type="password" class="ui-field" :placeholder="$t('New Password')" required>
            <button class="ui-btn" type="submit">{{ $t("Update Password") }}</button>
        </form>
        <section class="flex flex-col gap-3">
            <h3>Agent credentials</h3>
            <input v-model="label" class="ui-field" placeholder="Key label">
            <input v-model="endpoint" class="ui-field" placeholder="Target hostname and port (e.g. dockge.example.com:5001)">
            <button class="ui-btn" type="button" @click="createKey">Create key</button>
            <p v-if="newKey">Copy this key now; it will not be shown again: <code>{{ newKey }}</code></p>
            <div v-for="key in keys" :key="key.hash" class="flex items-center gap-2">
                <span>{{ key.label }} — {{ key.endpoint }} {{ key.revoked ? '(revoked)' : '' }}</span>
                <button v-if="!key.revoked" type="button" class="text-destructive cursor-pointer" @click="revokeKey(key.hash)">Revoke</button>
            </div>
        </section>
        <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    </div>
</template>

<script lang="ts">
import { authClient } from "../../mixins/socket";
export default {
    data() {
        return {
            currentPassword: "",
            newPassword: "",
            label: "",
            endpoint: "",
            newKey: "",
            keys: [] as { hash: string; label: string; endpoint: string; revoked: boolean }[],
            error: ""
        };
    },
    mounted() {
        this.loadKeys();
    },
    methods: {
        async changePassword() {
            const { error } = await authClient.changePassword({
                currentPassword: this.currentPassword,
                newPassword: this.newPassword,
                revokeOtherSessions: true
            });
            this.error = error?.message || "";
            if (!error) {
                this.currentPassword = "";
                this.newPassword = "";
            }
        },
        loadKeys() {
            this.$root.getSocket().emit("listAgentKeys", (res) => {
                if (res.ok) {
                    this.keys = res.keys;
                }
            });
        },
        createKey() {
            this.$root.getSocket().emit("createAgentKey", this.label, this.endpoint, (res) => {
                if (res.ok) {
                    this.newKey = res.key;
                    this.loadKeys();
                } else {
                    this.error = res.msg;
                }
            });
        },
        revokeKey(hash: string) {
            this.$root.getSocket().emit("revokeAgentKey", hash, (res) => {
                if (res.ok) {
                    this.loadKeys();
                } else {
                    this.error = res.msg;
                }
            });
        }
    }
};
</script>
