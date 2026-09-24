<template>
    <div v-if="settingsLoaded" class="flex w-full max-w-[28rem] flex-col gap-5">
        <!-- Change Password -->
        <template v-if="!settings.disableAuth">
            <div class="flex flex-col gap-[0.45rem]">
                <div class="mb-2 inline-block text-foreground">{{ $t("Current User") }}</div>
                <div class="flex flex-wrap items-center gap-3">
                    <span class="text-foreground font-medium">{{ $root.username }}</span>
                    <button
                        v-if="!settings.disableAuth"
                        id="logout-btn"
                        class="inline-flex items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-destructive text-sm font-medium cursor-pointer hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                        type="button"
                        @click="$root.logout"
                    >
                        <font-awesome-icon icon="sign-out-alt" /> {{ $t("Logout") }}
                    </button>
                </div>
            </div>

            <section class="collapsible flex flex-col items-start gap-0" :class="{ open: changePasswordOpen }">
                <button
                    type="button"
                    class="collapse-toggle group inline-flex items-center gap-[0.45rem] border-0 bg-transparent p-0 text-left text-inherit cursor-pointer hover:text-link"
                    :aria-expanded="changePasswordOpen"
                    aria-controls="change-password-panel"
                    @click="changePasswordOpen = !changePasswordOpen"
                >
                    <span class="m-0 text-base font-semibold group-hover:text-link">{{ $t("Change Password") }}</span>
                    <font-awesome-icon icon="chevron-down" class="chevron shrink-0 text-muted-foreground text-[0.7rem] transition-[transform,color] duration-150 group-hover:text-inherit" />
                </button>

                <div v-show="changePasswordOpen" id="change-password-panel" class="pt-3">
                    <form class="flex flex-col gap-3" @submit.prevent="savePassword">
                        <div class="flex flex-col">
                            <label for="current-password" class="mb-2 inline-block text-foreground">
                                {{ $t("Current Password") }}
                            </label>
                            <input
                                id="current-password"
                                v-model="password.currentPassword"
                                type="password"
                                class="block w-full min-h-[2.375rem] max-[575px]:min-h-[44px] rounded-md border border-border bg-input-surface px-3 py-1.5 text-secondary-foreground text-base focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                                autocomplete="current-password"
                                required
                            />
                        </div>

                        <div class="flex flex-col">
                            <label for="new-password" class="mb-2 inline-block text-foreground">
                                {{ $t("New Password") }}
                            </label>
                            <input
                                id="new-password"
                                v-model="password.newPassword"
                                type="password"
                                class="block w-full min-h-[2.375rem] max-[575px]:min-h-[44px] rounded-md border border-border bg-input-surface px-3 py-1.5 text-secondary-foreground text-base focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                                autocomplete="new-password"
                                required
                            />
                        </div>

                        <div class="flex flex-col">
                            <label for="repeat-new-password" class="mb-2 inline-block text-foreground">
                                {{ $t("Repeat New Password") }}
                            </label>
                            <input
                                id="repeat-new-password"
                                v-model="password.repeatNewPassword"
                                type="password"
                                class="block w-full min-h-[2.375rem] max-[575px]:min-h-[44px] rounded-md border border-border bg-input-surface px-3 py-1.5 text-secondary-foreground text-base focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                                :class="{ '!border-destructive': invalidPassword }"
                                :aria-invalid="invalidPassword"
                                aria-describedby="repeat-password-error"
                                autocomplete="new-password"
                                required
                            />
                            <div v-if="invalidPassword" id="repeat-password-error" class="mt-1 text-destructive text-sm" role="alert">
                                {{ $t("passwordNotMatchMsg") }}
                            </div>
                        </div>

                        <div>
                            <button class="rounded-md border border-primary px-5 py-1.5 cursor-pointer max-[575px]:min-h-[44px] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 bg-primary bg-gradient-primary text-primary-foreground hover:bg-gradient-primary-active" type="submit">
                                {{ $t("Update Password") }}
                            </button>
                        </div>
                    </form>
                </div>
            </section>
        </template>

        <!-- TODO: Hidden for now -->
        <div v-if="!settings.disableAuth && false" class="flex flex-col items-start gap-3">
            <h3 class="settings-subheading m-0 text-base font-semibold">
                {{ $t("Two Factor Authentication") }}
            </h3>
            <button
                class="rounded-md border border-primary px-5 py-1.5 cursor-pointer max-[575px]:min-h-[44px] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 bg-primary bg-gradient-primary text-primary-foreground hover:bg-gradient-primary-active"
                type="button"
                @click="$refs.TwoFADialog.show()"
            >
                {{ $t("2FA Settings") }}
            </button>
        </div>

        <section class="flex flex-col items-start gap-3">
            <h3 class="settings-subheading m-0 text-base font-semibold">{{ $t("Advanced") }}</h3>
            <button
                v-if="settings.disableAuth"
                id="enableAuth-btn"
                class="rounded-md border border-primary px-3 py-1 text-sm cursor-pointer max-[575px]:min-h-[44px] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 bg-transparent text-link hover:bg-primary-hover hover:text-primary-foreground"
                type="button"
                @click="enableAuth"
            >
                {{ $t("Enable Auth") }}
            </button>
            <button
                v-if="!settings.disableAuth"
                id="disableAuth-btn"
                class="rounded-md border border-primary px-3 py-1 text-sm cursor-pointer max-[575px]:min-h-[44px] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 bg-primary bg-gradient-primary text-primary-foreground hover:bg-gradient-primary-active"
                type="button"
                @click="confirmDisableAuth"
            >
                {{ $t("Disable Auth") }}
            </button>
        </section>

        <TwoFADialog ref="TwoFADialog" />

        <Confirm
            ref="confirmDisableAuth"
            btn-style="danger"
            :yes-text="$t('I understand, please disable')"
            :no-text="$t('Leave')"
            @yes="disableAuth"
        >
            <i18n-t keypath="disableauth.message1" tag="p">
                <template #disableAuth>
                    <strong>{{ $t('disableAuth') }}</strong>
                </template>
            </i18n-t>

            <i18n-t keypath="disableauth.message2" tag="p">
                <template #scenarios>
                    <strong>{{ $t('scenarios') }}</strong>
                </template>
            </i18n-t>

            <p>{{ $t("Please use this option carefully!") }}</p>

            <div class="mb-[1rem]">
                <label for="current-password2" class="mb-2 inline-block text-foreground">
                    {{ $t("Current Password") }}
                </label>
                <input
                    id="current-password2"
                    v-model="password.currentPassword"
                    type="password"
                    class="block w-full min-h-[2.375rem] max-[575px]:min-h-[44px] rounded-md border border-border bg-input-surface px-3 py-1.5 text-secondary-foreground text-base focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                    required
                />
            </div>
        </Confirm>
    </div>
</template>

<script>
import Confirm from "../../components/Confirm.vue";
import TwoFADialog from "../../components/TwoFADialog.vue";

export default {
    components: {
        Confirm,
        TwoFADialog
    },

    data() {
        return {
            invalidPassword: false,
            changePasswordOpen: false,
            password: {
                currentPassword: "",
                newPassword: "",
                repeatNewPassword: "",
            }
        };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        }
    },

    watch: {
        "password.repeatNewPassword"() {
            this.invalidPassword = false;
        },
    },

    methods: {
        /** Check new passwords match before saving them */
        savePassword() {
            if (this.password.newPassword !== this.password.repeatNewPassword) {
                this.invalidPassword = true;
            } else {
                this.$root
                    .getSocket()
                    .emit("changePassword", this.password, (res) => {
                        this.$root.toastRes(res);
                        if (res.ok) {
                            this.password.currentPassword = "";
                            this.password.newPassword = "";
                            this.password.repeatNewPassword = "";
                        }
                    });
            }
        },

        /** Disable authentication for web app access */
        disableAuth() {
            this.settings.disableAuth = true;

            // Need current password to disable auth
            // Set it to empty if done
            this.saveSettings(() => {
                this.password.currentPassword = "";
                this.$root.username = null;
                this.$root.socketIO.token = "autoLogin";
            }, this.password.currentPassword);
        },

        /** Enable authentication for web app access */
        enableAuth() {
            this.settings.disableAuth = false;
            this.saveSettings();
            this.$root.storage().removeItem("token");
            location.reload();
        },

        /** Show confirmation dialog for disable auth */
        confirmDisableAuth() {
            this.$refs.confirmDisableAuth.show();
        },

    },
};
</script>

<style scoped>
.collapsible.open .chevron { transform: rotate(180deg); }
</style>
