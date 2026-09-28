<template>
    <div class="flex w-full max-w-[28rem] flex-col gap-5">
        <div class="flex items-center gap-3">
            <strong>{{ $root.username }}</strong>
            <button class="floating-menu-item is-danger !w-auto cursor-pointer" type="button" @click="$root.logout">
                <font-awesome-icon icon="sign-out-alt" />
                {{ $t("Logout") }}
            </button>
        </div>
        <form class="flex flex-col gap-3" @submit.prevent="changePassword">
            <h3>{{ $t("Change Password") }}</h3>
            <input v-model="currentPassword" type="password" class="ui-field" :placeholder="$t('Current Password')" required>
            <input v-model="newPassword" type="password" class="ui-field" :placeholder="$t('New Password')" required>
            <button class="ui-btn" type="submit">{{ $t("Update Password") }}</button>
        </form>
        <section v-if="$root.superadmin" class="flex flex-col gap-3 border-t border-border pt-4">
            <h3>{{ $t('adminAccounts') }}</h3>
            <p class="text-muted-foreground text-sm">{{ $t('adminAccountsHint') }}</p>
            <button type="button" class="ui-btn" :disabled="usersBusy" @click="loadUsers">{{ $t('refresh') }}</button>
            <div v-for="user in users" :key="user.id" class="flex flex-wrap items-center justify-between gap-2">
                <span>{{ user.name }} — {{ user.email }} <span v-if="user.superadmin">({{ $t('superadminRole') }})</span><span v-else-if="user.admin">({{ $t('adminRole') }})</span></span>
                <button v-if="!user.admin" type="button" class="ui-btn" :disabled="usersBusy" @click="promoteUser(user)">{{ $t('promoteAdmin') }}</button>
            </div>
            <p v-if="usersError" role="alert" class="text-destructive">{{ usersError }}</p>
        </section>
        <section class="flex flex-col gap-3">
            <h3>Agent credentials</h3>
            <input v-model="label" class="ui-field" placeholder="Key label">
            <input v-model="endpoint" class="ui-field" placeholder="Target hostname and port (e.g. dockgeek.example.com:5001)">
            <button class="ui-btn" type="button" @click="createKey">Create key</button>
            <p v-if="newKey">Copy this key now; it will not be shown again: <code>{{ newKey }}</code></p>
            <div v-for="key in keys" :key="key.hash" class="flex items-center gap-2">
                <span>{{ key.label }} — {{ key.endpoint }} {{ key.revoked ? '(revoked)' : '' }}</span>
                <button v-if="!key.revoked" type="button" class="text-destructive cursor-pointer" @click="revokeKey(key.hash)">Revoke</button>
            </div>
        </section>
        <section class="flex flex-col gap-3 border-t border-border pt-4">
            <h3>{{ $t('gitCredentials') }}</h3>
            <p class="text-muted-foreground text-sm">{{ $t('gitCredentialsHint') }}</p>
            <label class="flex flex-col gap-1">{{ $t('gitAgent') }}
                <select v-model="gitEndpoint" class="ui-field" @change="gitConfigured = false; gitBusy = false; loadGitCredentials()">
                    <option value="">{{ $t('Current') }}</option>
                    <option v-for="(agent, agentEndpoint) in $root.agentList" :key="agentEndpoint" :value="agentEndpoint">{{ agent.name || agentEndpoint }}</option>
                </select>
            </label>
            <label class="flex flex-col gap-1">{{ $t('gitProjectName') }}
                <input v-model.trim="gitProjectName" class="ui-field" :disabled="gitProjectsRoot" :placeholder="$t('gitProjectNameHint')" @input="gitConfigured = false; gitBusy = false">
            </label>
            <label class="flex items-center gap-2"><input v-model="gitProjectsRoot" type="checkbox" @change="gitConfigured = false; gitBusy = false; loadGitCredentials()">{{ $t('gitProjectsRoot') }}</label>
            <button type="button" class="ui-btn" :disabled="gitBusy || (!gitProjectsRoot && !gitProjectName)" @click="loadGitCredentials">{{ $t('refresh') }}</button>
            <div v-if="gitConfigured" class="flex flex-wrap items-center gap-2">
                <span>{{ $t('gitCredentialConfigured', { type: gitCredentialType === 'ssh' ? $t('gitSshKey') : $t('gitHttpsToken') }) }}</span>
                <button type="button" class="ui-btn" :disabled="gitBusy" @click="deleteGitCredential">{{ $t('gitRemoveCredential') }}</button>
            </div>
            <form class="flex flex-col gap-3" @submit.prevent="saveGitCredential">
                <label class="flex flex-col gap-1">{{ $t('type') }}
                    <select v-model="gitForm.type" class="ui-field">
                        <option value="https">{{ $t('gitHttpsToken') }}</option>
                        <option value="ssh">{{ $t('gitSshKey') }}</option>
                    </select>
                </label>
                <label v-if="gitForm.type === 'https'" class="flex flex-col gap-1">{{ $t('Username') }}
                    <input v-model.trim="gitForm.username" class="ui-field" autocomplete="off">
                </label>
                <label v-if="gitForm.type === 'https'" class="flex flex-col gap-1">{{ $t('gitHttpsToken') }}
                    <input v-model="gitForm.token" type="password" class="ui-field" autocomplete="new-password" :placeholder="$t('gitSecretWriteOnly')">
                </label>
                <template v-else>
                    <label class="flex flex-col gap-1">{{ $t('gitSshKey') }}
                        <textarea v-model="gitForm.privateKey" class="ui-field" rows="5" autocomplete="off" :placeholder="$t('gitSecretWriteOnly')" />
                    </label>
                </template>
                <button type="submit" class="ui-btn" :disabled="gitBusy || (!gitProjectsRoot && !gitProjectName) || !(gitForm.type === 'https' ? gitForm.username && gitForm.token : gitForm.privateKey)">{{ $t('Save') }}</button>
            </form>
            <p v-if="gitError" role="alert" class="text-destructive">{{ gitError }}</p>
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
            error: "",
            users: [] as { id: string; name: string; email: string; admin: boolean; superadmin: boolean }[],
            usersBusy: false,
            usersError: "",
            gitEndpoint: "",
            gitBusy: false,
            gitError: "",
            gitProjectName: "",
            gitProjectsRoot: false,
            gitConfigured: false,
            gitCredentialType: "",
            gitForm: { type: "https", username: "", token: "", privateKey: "" },
        };
    },
    mounted() {
        this.loadKeys();
        if (this.$root.superadmin) {
            this.loadUsers();
        }
    },
    methods: {
        loadUsers() {
            this.usersBusy = true;
            this.usersError = "";
            this.$root.getSocket().emit("listAuthUsers", (res) => {
                this.usersBusy = false;
                if (res?.ok) {
                    this.users = res.users;
                } else {
                    this.usersError = res?.msg || this.$t("adminAccountsError");
                }
            });
        },
        promoteUser(user: { id: string; name: string; email: string; admin: boolean }) {
            if (!confirm(this.$t("promoteAdminConfirm", { email: user.email }))) {
                return;
            }
            this.usersBusy = true;
            this.usersError = "";
            this.$root.getSocket().emit("promoteAdmin", user.id, (res) => {
                this.usersBusy = false;
                if (res?.ok) {
                    this.loadUsers();
                } else {
                    this.usersError = res?.msg || this.$t("adminAccountsError");
                }
            });
        },
        loadGitCredentials() {
            if (!this.gitProjectsRoot && !this.gitProjectName) {
                return;
            }
            const name = this.gitProjectsRoot ? "" : this.gitProjectName;
            const endpoint = this.gitEndpoint;
            this.gitError = "";
            this.gitBusy = true;
            this.$root.emitAgent(endpoint, "listGitCredentials", { name }, (res) => {
                if (name !== (this.gitProjectsRoot ? "" : this.gitProjectName) || endpoint !== this.gitEndpoint) {
                    return;
                }
                this.gitBusy = false;
                if (res?.ok) {
                    this.gitConfigured = !!res.configured;
                    this.gitCredentialType = res.type || "";
                    this.gitForm.type = res.type || "https";
                    this.gitForm.username = res.username || "";
                } else {
                    this.gitConfigured = false;
                    this.gitError = res?.msg || this.$t("gitCredentialError");
                }
            });
        },
        saveGitCredential() {
            this.gitBusy = true;
            this.gitError = "";
            const name = this.gitProjectsRoot ? "" : this.gitProjectName;
            const payload = this.gitForm.type === "ssh"
                ? { name, type: "ssh", privateKey: this.gitForm.privateKey }
                : { name, type: "https", username: this.gitForm.username, token: this.gitForm.token };
            const endpoint = this.gitEndpoint;
            this.$root.emitAgent(endpoint, "setGitCredential", payload, (res) => {
                this.gitBusy = false;
                this.gitForm.token = "";
                this.gitForm.privateKey = "";
                if (res?.ok && (this.gitProjectsRoot ? "" : this.gitProjectName) === payload.name && this.gitEndpoint === endpoint) {
                    this.loadGitCredentials();
                } else {
                    this.gitError = res?.msg || this.$t("gitCredentialError");
                }
            });
        },
        deleteGitCredential() {
            if (!confirm(this.$t("gitDeleteCredentialConfirm"))) {
                return;
            }
            this.gitBusy = true;
            this.gitError = "";
            const name = this.gitProjectsRoot ? "" : this.gitProjectName;
            const endpoint = this.gitEndpoint;
            this.$root.emitAgent(endpoint, "deleteGitCredential", { name }, (res) => {
                this.gitBusy = false;
                if (res?.ok && (this.gitProjectsRoot ? "" : this.gitProjectName) === name && this.gitEndpoint === endpoint) {
                    this.loadGitCredentials();
                } else {
                    this.gitError = res?.msg || this.$t("gitCredentialError");
                }
            });
        },
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
