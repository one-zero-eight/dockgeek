<template>
    <FloatingDialog
        v-model="visible"
        :title="$t('Setup 2FA')"
        :hide-footer="!(uri && twoFAStatus == false)"
        @hidden="onHidden"
    >
        <template #header>
            <h5 class="fd-title">
                {{ $t("Setup 2FA") }}
                <span v-if="twoFAStatus == true" class="inline-block rounded-[.375rem] bg-primary px-[.65em] py-[.35em] align-baseline text-primary-foreground text-xs font-medium leading-none">{{ $t("Active") }}</span>
                <span v-if="twoFAStatus == false" class="inline-block rounded-[.375rem] bg-primary px-[.65em] py-[.35em] align-baseline text-primary-foreground text-xs font-medium leading-none">{{ $t("Inactive") }}</span>
            </h5>
        </template>

        <div class="mb-[1rem]">
            <div v-if="uri && twoFAStatus == false" class="mx-auto w-[210px] text-center">
                <vue-qrcode :key="uri" :value="uri" type="image/png" :quality="1" :color="{ light: '#ffffffff' }" />
                <button v-show="!showURI" type="button" class="two-fa-button inline-flex min-h-[38px] items-center justify-center rounded-[.375rem] bg-secondary px-[.75rem] py-[.375rem] text-secondary-foreground leading-[1.5] cursor-pointer disabled:cursor-not-allowed disabled:opacity-65 focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[2px] two-fa-outline two-fa-small mt-[0.5rem]" @click="showURI = true">{{ $t("Show URI") }}</button>
            </div>
            <p v-if="showURI && twoFAStatus == false" class="break-words mt-[0.5rem]">{{ uri }}</p>

            <div v-if="!(uri && twoFAStatus == false)" class="mb-[1rem]">
                <label for="current-password" class="mb-[.5rem] inline-block text-foreground">
                    {{ $t("Current Password") }}
                </label>
                <input
                    id="current-password"
                    v-model="currentPassword"
                    type="password"
                    class="two-fa-input block w-full min-h-[38px] rounded-[.375rem] border border-border bg-input-surface px-[.75rem] py-[.375rem] text-foreground leading-[1.5] focus:border-primary focus:outline-[2px] focus:outline-ring focus:outline-offset-[1px]"
                    autocomplete="current-password"
                    required
                />
            </div>

            <button v-if="uri == null && twoFAStatus == false" class="two-fa-button inline-flex min-h-[38px] items-center justify-center rounded-[.375rem] bg-secondary px-[.75rem] py-[.375rem] text-secondary-foreground leading-[1.5] cursor-pointer disabled:cursor-not-allowed disabled:opacity-65 focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[2px] two-fa-primary" type="button" @click="prepare2FA()">
                {{ $t("Enable 2FA") }}
            </button>

            <button v-if="twoFAStatus == true" class="two-fa-button inline-flex min-h-[38px] items-center justify-center rounded-[.375rem] bg-secondary px-[.75rem] py-[.375rem] text-secondary-foreground leading-[1.5] cursor-pointer disabled:cursor-not-allowed disabled:opacity-65 focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[2px] two-fa-danger" type="button" :disabled="processing" @click="confirmDisableTwoFA()">
                {{ $t("Disable 2FA") }}
            </button>

            <div v-if="uri && twoFAStatus == false" class="mt-[1rem]">
                <label for="two-fa-token" class="mb-[.5rem] inline-block text-foreground">{{ $t("twoFAVerifyLabel") }}</label>
                <div class="two-fa-token-group flex w-full">
                    <input id="two-fa-token" v-model="token" type="text" maxlength="6" class="two-fa-input block w-full min-h-[38px] rounded-[.375rem] border border-border bg-input-surface px-[.75rem] py-[.375rem] text-foreground leading-[1.5] focus:border-primary focus:outline-[2px] focus:outline-ring focus:outline-offset-[1px]" autocomplete="one-time-code" required>
                    <button class="two-fa-button inline-flex min-h-[38px] items-center justify-center rounded-[.375rem] bg-secondary px-[.75rem] py-[.375rem] text-secondary-foreground leading-[1.5] cursor-pointer disabled:cursor-not-allowed disabled:opacity-65 focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[2px] two-fa-outline" type="button" @click="verifyToken()">{{ $t("Verify Token") }}</button>
                </div>
                <p v-show="tokenValid" class="mt-[0.5rem]" style="color: green;">{{ $t("tokenValidSettingsMsg") }}</p>
            </div>
        </div>

        <template #footer>
            <button type="button" class="two-fa-button inline-flex min-h-[38px] items-center justify-center rounded-[.375rem] bg-secondary px-[.75rem] py-[.375rem] text-secondary-foreground leading-[1.5] cursor-pointer disabled:cursor-not-allowed disabled:opacity-65 focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[2px] two-fa-primary" :disabled="processing || tokenValid == false" @click="confirmEnableTwoFA()">
                <div v-if="processing" class="two-fa-spinner me-[0.25rem] inline-block h-[1rem] w-[1rem] rounded-full border-[.2em] border-current border-r-transparent align-[-.125em]"></div>
                {{ $t("Save") }}
            </button>
        </template>
    </FloatingDialog>

    <Confirm ref="confirmEnableTwoFA" btn-style="danger" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="save2FA">
        {{ $t("confirmEnableTwoFAMsg") }}
    </Confirm>

    <Confirm ref="confirmDisableTwoFA" btn-style="danger" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="disable2FA">
        {{ $t("confirmDisableTwoFAMsg") }}
    </Confirm>
</template>

<script lang="ts">
import FloatingDialog from "./floating/FloatingDialog.vue";
import Confirm from "./Confirm.vue";
import VueQrcode from "vue-qrcode";
import { toast } from "vue-sonner";

export default {
    components: {
        FloatingDialog,
        Confirm,
        VueQrcode,
    },
    props: {},
    data() {
        return {
            currentPassword: "",
            processing: false,
            uri: null,
            tokenValid: false,
            twoFAStatus: null,
            token: null,
            showURI: false,
            visible: false,
        };
    },
    methods: {
        /** Show the dialog */
        show() {
            this.visible = true;
            this.getStatus();
        },

        /** Reset the dialog state once it is fully closed */
        onHidden() {
            this.currentPassword = "";
            this.token = null;
            this.tokenValid = false;
            this.showURI = false;
        },

        /** Show dialog to confirm enabling 2FA */
        confirmEnableTwoFA() {
            this.$refs.confirmEnableTwoFA.show();
        },

        /** Show dialog to confirm disabling 2FA */
        confirmDisableTwoFA() {
            this.$refs.confirmDisableTwoFA.show();
        },

        /** Prepare 2FA configuration */
        prepare2FA() {
            this.processing = true;

            this.$root.getSocket().emit("prepare2FA", this.currentPassword, (res) => {
                this.processing = false;

                if (res.ok) {
                    this.uri = res.uri;
                } else {
                    toast.error(res.msg);
                }
            });
        },

        /** Save the current 2FA configuration */
        save2FA() {
            this.processing = true;

            this.$root.getSocket().emit("save2FA", this.currentPassword, (res) => {
                this.processing = false;

                if (res.ok) {
                    this.$root.toastRes(res);
                    this.getStatus();
                    this.visible = false;
                } else {
                    toast.error(res.msg);
                }
            });
        },

        /** Disable 2FA for this user */
        disable2FA() {
            this.processing = true;

            this.$root.getSocket().emit("disable2FA", this.currentPassword, (res) => {
                this.processing = false;

                if (res.ok) {
                    this.$root.toastRes(res);
                    this.getStatus();
                    this.visible = false;
                } else {
                    toast.error(res.msg);
                }
            });
        },

        /** Verify the token generated by the user */
        verifyToken() {
            this.$root.getSocket().emit("verifyToken", this.token, this.currentPassword, (res) => {
                if (res.ok) {
                    this.tokenValid = res.valid;
                } else {
                    toast.error(res.msg);
                }
            });
        },

        /** Get current status of 2FA */
        getStatus() {
            this.$root.getSocket().emit("twoFAStatus", (res) => {
                if (res.ok) {
                    this.twoFAStatus = res.status;
                } else {
                    toast.error(res.msg);
                }
            });
        },
    },
};
</script>

<style lang="scss">
.two-fa-button {
    appearance: none;

    &.two-fa-primary {
        background: var(--gradient-primary);
        color: var(--primary-foreground);

        &:hover:not(:disabled) {
            background: var(--gradient-primary-active);
        }
    }

    &.two-fa-danger {
        background: var(--gradient-danger);
        color: #fff;

        &:hover:not(:disabled) {
            background: var(--gradient-danger-active);
        }
    }

    &.two-fa-outline {
        color: var(--link);
        background-color: transparent;

        &:hover:not(:disabled) {
            background-color: var(--primary);
            color: var(--primary-foreground);
        }
    }

    &.two-fa-small {
        min-height: 30px;
        padding: 0.25rem 0.5rem;
        border-radius: 25px;
        font-size: var(--text-sm-fontSize);
    }

}

.two-fa-token-group {
    display: flex;
    width: 100%;

    .two-fa-input {
        min-width: 0;
        flex: 1 1 auto;
        border-start-end-radius: 0;
        border-end-end-radius: 0;
    }

    .two-fa-button {
        flex: 0 0 auto;
        border-start-start-radius: 0;
        border-end-start-radius: 0;
        margin-inline-start: -1px;
    }
}

.two-fa-spinner {
    animation: two-fa-spin 0.75s linear infinite;
}

@keyframes two-fa-spin {
    to { transform: rotate(360deg); }
}
</style>
