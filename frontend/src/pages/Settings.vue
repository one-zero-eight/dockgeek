<template>
    <div class="settings-page flex flex-col gap-4 w-full max-w-[1100px] mx-auto min-h-0">
        <div class="settings-shell grid gap-4 min-h-0 items-start">
            <nav v-if="showSubMenu" class="settings-nav flex flex-col gap-1 p-2 rounded-[0.85rem] bg-card" :aria-label="$t('Settings')">
                <div v-if="$root.isCompact && $root.loggedIn" class="account-block flex items-center gap-3 mb-[0.35rem] py-[0.65rem] px-3 rounded-[0.65rem]">
                    <div class="profile-pic flex flex-none items-center justify-center w-[34px] h-[34px] rounded-full border-0 bg-primary bg-gradient-primary text-primary-foreground text-sm font-bold">{{ $root.usernameFirstChar }}</div>
                    <div class="account-text min-w-0 text-sm">
                        <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp">
                            <strong>{{ $root.username }}</strong>
                        </i18n-t>
                        <span v-else>{{ $t("signedInDispDisabled") }}</span>
                    </div>
                </div>
                <router-link
                    v-for="(item, key) in subMenus"
                    :key="key"
                    class="settings-nav-item flex items-center gap-[0.65rem] w-full rounded-[0.6rem] text-left font-medium cursor-pointer"
                    :to="`/settings/${key}`"
                    active-class="active"
                >
                    <font-awesome-icon :icon="item.icon" class="nav-icon" />
                    <span>{{ item.title }}</span>
                </router-link>

                <div v-if="$root.isCompact && $root.loggedIn" class="settings-nav-actions flex flex-col gap-1 mt-4">
                    <button type="button" class="settings-nav-item menu-action flex w-full items-center gap-[0.65rem] rounded-[0.6rem] text-left font-medium" @click="scanFolder">
                        <font-awesome-icon icon="arrows-rotate" class="nav-icon" />
                        <span>{{ $t("scanFolder") }}</span>
                    </button>

                    <button
                        type="button"
                        class="settings-nav-item menu-action logout flex w-full items-center gap-[0.65rem] rounded-[0.6rem] text-left font-medium"
                        @click="$root.logout"
                    >
                        <font-awesome-icon icon="sign-out-alt" class="nav-icon" />
                        <span>{{ $t("Logout") }}</span>
                    </button>
                </div>
            </nav>

            <section v-if="currentPage" class="settings-panel min-w-0 rounded-[0.85rem] bg-card overflow-hidden">
                <div class="settings-panel-header flex items-center gap-[0.65rem] py-4 px-5 border-b-0 bg-card" :class="{ 'has-back': $root.isMobile }">
                    <router-link
                        v-if="$root.isMobile"
                        to="/settings"
                        class="back-btn"
                        :aria-label="$t('backToSettings')"
                    >
                        <font-awesome-icon icon="chevron-left" />
                    </router-link>
                    <div class="panel-heading flex items-center gap-[0.65rem] min-w-0">
                        <font-awesome-icon :icon="subMenus[currentPage].icon" class="panel-icon" />
                        <h2>{{ subMenus[currentPage].title }}</h2>
                    </div>
                </div>

                <div class="settings-panel-body">
                    <router-view v-slot="{ Component }">
                        <transition name="slide-fade" appear>
                            <component :is="Component" />
                        </transition>
                    </router-view>
                </div>
            </section>
        </div>
    </div>
</template>

<script>
import { ALL_ENDPOINTS } from "../../../common/util-common";

export default {
    data() {
        return {
            settings: {},
            settingsLoaded: false,
        };
    },

    computed: {
        currentPage() {
            let pathSplit = this.$route.path.split("/");
            let pathEnd = pathSplit[pathSplit.length - 1];
            if (!pathEnd || pathEnd === "settings") {
                return null;
            }
            return pathEnd;
        },

        showSubMenu() {
            if (this.$root.isMobile) {
                return !this.currentPage;
            } else {
                return true;
            }
        },

        subMenus() {
            return {
                general: {
                    title: this.$t("general"),
                    icon: "wrench",
                },
                appearance: {
                    title: this.$t("Appearance"),
                    icon: "palette",
                },
                security: {
                    title: this.$t("Security"),
                    icon: "lock",
                },
                globalEnv: {
                    title: this.$t("GlobalEnv"),
                    icon: "file-pen",
                },
                about: {
                    title: this.$t("About"),
                    icon: "info-circle",
                },
            };
        },
    },

    watch: {
        "$root.isMobile"() {
            this.loadGeneralPage();
        }
    },

    mounted() {
        this.loadSettings();
        this.loadGeneralPage();
    },

    methods: {

        /**
         * Load the general settings page
         * For desktop only, on mobile do nothing
         */
        loadGeneralPage() {
            if (!this.currentPage && !this.$root.isMobile) {
                this.$router.push("/settings/general");
            }
        },

        /** Load settings from server */
        loadSettings() {
            this.$root.getSocket().emit("getSettings", (res) => {
                this.settings = res.data;
                if (this.settings.checkUpdate === undefined) {
                    this.settings.checkUpdate = true;
                }
                this.settingsLoaded = true;
            });
        },

        /**
         * Callback for saving settings
         * @callback saveSettingsCB
         * @param {Object} res Result of operation
         */

        /**
         * Save Settings
         * @param {saveSettingsCB} [callback]
         * @param {string} [currentPassword] Only need for disableAuth to true
         * @param {boolean} [silentSuccess] Skip the success toast for inline save feedback
         */
        saveSettings(callback, currentPassword, silentSuccess = false) {
            let valid = this.validateSettings();
            if (valid.success) {
                this.$root.getSocket().emit("setSettings", this.settings, currentPassword, (res) => {
                    if (!res.ok || !silentSuccess) {
                        this.$root.toastRes(res);
                    }
                    if (res.ok) {
                        this.loadSettings();
                    }

                    if (callback) {
                        callback(res);
                    }
                });
            } else {
                this.$root.toastError(valid.msg);
                if (callback) {
                    callback({ ok: false });
                }
            }
        },

        /**
         * Ensure settings are valid
         * @returns {Object} Contains success state and error msg
         */
        validateSettings() {
            if (this.settings.keepDataPeriodDays < 0) {
                return {
                    success: false,
                    msg: this.$t("dataRetentionTimeError"),
                };
            }
            return {
                success: true,
                msg: "",
            };
        },

        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestProjectList", (res) => {
                this.$root.toastRes(res);
            });
        },
    }
};
</script>

<style lang="scss" scoped>
.settings-shell {
    grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
}

.settings-nav-item {
    padding: 0.65rem 0.8rem;
    border: 0;
    background: transparent;
    color: var(--secondary-foreground);
    text-decoration: none !important;
    line-height: var(--line-height-tight);
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease;

    .nav-icon {
        width: 1.1rem;
        text-align: center;
        color: var(--muted-foreground);
        flex: 0 0 auto;
    }

    &:hover:not(.active),
    &:focus-visible:not(.active) {
        background: var(--hover);
    }

    &.active {
        color: var(--primary);
        background: var(--selected);

        .nav-icon {
            color: currentColor;
        }
    }
}

.logout {
    color: var(--destructive);

    .nav-icon {
        color: inherit;
    }
}

.settings-panel-header {
    &.has-back {
        gap: 0.35rem;
        padding-left: 0.65rem;
    }

    .back-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 2rem;
        height: 2rem;
        border-radius: 0.5rem;
        color: var(--link);
        text-decoration: none !important;
        transition: background 0.15s ease, color 0.15s ease;

        &:hover,
        &:focus-visible {
            color: var(--link);
            background: var(--hover);
            outline: none;
        }

        svg {
            font-size: 0.95rem;
        }
    }

    .panel-icon {
        color: var(--link);
    }

    h2 {
        margin: 0;
        color: var(--foreground);
        font-size: 1.25rem;
        font-weight: var(--fontWeight-medium);
    }
}

.settings-panel-body {
    padding: 1.25rem 1.35rem 1.5rem;

    :deep(.form-label) {
        margin-bottom: 0.45rem;
        color: var(--foreground);
        font-size: var(--text-sm-fontSize);
        font-weight: var(--fontWeight-semibold);
    }

    :deep(.settings-subheading),
    :deep(.username) {
        color: var(--foreground);
    }

    :deep(.form-text) {
        margin-top: 0.4rem;
    }

}

@media (max-width: 767.98px) {
    .settings-shell {
        grid-template-columns: 1fr;
    }

    .settings-panel-body {
        padding: 1rem;
    }

    .settings-panel-header {
        padding: 0.9rem 1rem;
    }
}
</style>
