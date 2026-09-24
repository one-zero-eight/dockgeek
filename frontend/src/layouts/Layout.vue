<template>
    <div class="app-layout flex h-full min-h-0 flex-col overflow-hidden" :class="classes">
        <div v-if="! $root.socketIO.connected && ! $root.socketIO.firstConnect" class="lost-connection fixed w-full p-[5px] z-[99999] bg-[crimson] text-white">
            <div class="w-full px-3">
                {{ $root.socketIO.connectionErrorMsg }}
                <div v-if="$root.socketIO.showReverseProxyGuide">
                    {{ $t("reverseProxyMsg1") }} <a href="https://github.com/louislam/uptime-kuma/wiki/Reverse-Proxy" target="_blank">{{ $t("reverseProxyMsg2") }}</a>
                </div>
            </div>
        </div>

        <!-- Desktop header -->
        <header v-if="!$root.isCompact" class="desktop-header flex flex-none flex-wrap justify-center items-center gap-2 min-h-[52px] mb-0 py-[0.4rem] bg-card border-b">
            <router-link to="/" class="brand flex items-center min-h-8 mb-0 me-auto no-underline text-foreground">
                <img class="me-2 ms-4" width="32" height="32" src="/icon.svg" alt="" />
                <span class="title text-2xl font-bold">Dockge</span>
            </router-link>

            <a v-if="hasNewVersion" target="_blank" href="https://github.com/louislam/dockge/releases" class="update-button me-3">
                <font-awesome-icon icon="arrow-alt-circle-up" /> {{ $t("newUpdate") }}
            </a>

            <ul class="header-nav flex items-center gap-[0.15rem] me-[25px] m-0 p-0 list-none">
                <li v-if="$root.loggedIn" class="nav-item">
                    <router-link to="/" class="nav-link inline-flex items-center gap-[0.4rem] px-3 py-[0.35rem] rounded-lg font-medium no-underline">
                        <font-awesome-icon icon="home" /> {{ $t("home") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item">
                    <router-link to="/console" class="nav-link inline-flex items-center gap-[0.4rem] px-3 py-[0.35rem] rounded-lg font-medium no-underline">
                        <font-awesome-icon icon="terminal" /> {{ $t("console") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item">
                    <router-link to="/files" class="nav-link inline-flex items-center gap-[0.4rem] px-3 py-[0.35rem] rounded-lg font-medium no-underline">
                        <font-awesome-icon icon="folder-open" /> {{ $t("files") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item">
                    <router-link to="/settings/general" class="nav-link inline-flex items-center gap-[0.4rem] px-3 py-[0.35rem] rounded-lg font-medium no-underline" :class="{ active: $route.path.includes('settings') }">
                        <font-awesome-icon icon="cog" /> {{ $t("Settings") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item">
                    <FloatingMenu placement="bottom-end" panel-class="profile-menu !bg-card !text-card-foreground">
                        <template #trigger="{ triggerAttrs }">
                            <div v-bind="triggerAttrs" class="nav-link dropdown-profile-pic inline-flex items-center gap-[0.4rem] select-none cursor-pointer rounded-lg bg-transparent text-secondary-foreground" role="button" tabindex="0">
                                <div class="profile-pic flex items-center justify-center w-6 h-6 rounded-full border border-border bg-primary bg-gradient-primary text-primary-foreground text-xs font-bold">{{ $root.usernameFirstChar }}</div>
                                <font-awesome-icon icon="angle-down" />
                            </div>
                        </template>

                        <!-- Header's Dropdown Menu -->
                        <div class="dropdown-item-text">
                            <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp">
                                <strong>{{ $root.username }}</strong>
                            </i18n-t>
                            <span v-if="$root.username == null">{{ $t("signedInDispDisabled") }}</span>
                        </div>

                        <div class="floating-menu-divider" />

                        <button class="floating-menu-item" type="button" role="menuitem" @click="scanFolder">
                            <font-awesome-icon icon="arrows-rotate" /> {{ $t("scanFolder") }}
                        </button>

                        <router-link to="/settings/general" class="floating-menu-item" role="menuitem" :class="{ active: $route.path.includes('settings') }">
                            <font-awesome-icon icon="cog" /> {{ $t("Settings") }}
                        </router-link>

                        <button class="floating-menu-item is-danger" type="button" role="menuitem" @click="$root.logout">
                            <font-awesome-icon icon="sign-out-alt" />
                            {{ $t("Logout") }}
                        </button>
                    </FloatingMenu>
                </li>
            </ul>
        </header>

        <main class="flex min-h-0 flex-[1_1_0] flex-col overflow-x-hidden overflow-y-auto max-[991.98px]:p-[12px_12px_calc(76px+env(safe-area-inset-bottom))]">
            <div v-if="$root.socketIO.connecting" class="w-full mx-auto mt-5 px-3">
                <h4>{{ $t("connecting...") }}</h4>
            </div>

            <router-view v-if="$root.loggedIn" />
            <Login v-if="! $root.loggedIn && $root.allowLoginDialog" />
        </main>

        <nav v-if="$root.isCompact && $root.loggedIn" class="bottom-nav fixed bottom-0 left-0 z-1000 w-full flex bg-card text-center whitespace-nowrap" :aria-label="$t('mainNavigation')">
            <router-link to="/" exact-active-class="active"><font-awesome-icon icon="home" /><span>{{ $t("home") }}</span></router-link>
            <router-link to="/stacks"><font-awesome-icon icon="stream" /><span>{{ $t("stacks") }}</span></router-link>
            <router-link to="/console"><font-awesome-icon icon="terminal" /><span>{{ $t("console") }}</span></router-link>
            <router-link to="/files"><font-awesome-icon icon="folder-open" /><span>{{ $t("files") }}</span></router-link>
            <router-link to="/settings"><font-awesome-icon icon="cog" /><span>{{ $t("Settings") }}</span></router-link>
        </nav>
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import { FloatingMenu } from "../components/floating";
import { compareVersions } from "compare-versions";
import { ALL_ENDPOINTS } from "../../../common/util-common";

export default {

    components: {
        Login,
        FloatingMenu,
    },

    data() {
        return {

        };
    },

    computed: {

        // Theme or Mobile
        classes() {
            const classes = {};
            classes[this.$root.theme] = true;
            classes["mobile"] = this.$root.isMobile;
            return classes;
        },

        hasNewVersion() {
            if (this.$root.info.latestVersion && this.$root.info.version) {
                return compareVersions(this.$root.info.latestVersion, this.$root.info.version) >= 1;
            } else {
                return false;
            }
        },

    },

    watch: {

    },

    mounted() {

    },

    beforeUnmount() {

    },

    methods: {
        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.$root.toastRes(res);
            });
        },
    },

};
</script>

<style lang="scss" scoped>
.nav-link {
    &.status-page {
        background-color: rgba(255, 255, 255, 0.1);
    }
}

.bottom-nav {
    height: calc(60px + env(safe-area-inset-bottom));
    padding: 0 10px env(safe-area-inset-bottom);

    a {
        text-align: center;
        width: 20%;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        padding: 8px 10px 0;
        color: var(--secondary-foreground);
        font-size: var(--font-size-body-sm);
        font-weight: var(--font-weight-medium);
        overflow: hidden;
        text-decoration: none;

        &.router-link-exact-active, &.active {
            color: var(--primary);
            font-weight: var(--font-weight-semibold);
        }

        svg {
            font-size: 20px;
        }

        span {
            margin-top: 2px;
            overflow: hidden;
            max-width: 100%;
            text-overflow: ellipsis;
        }
    }
}

.mobile main {
    padding-bottom: calc(76px + env(safe-area-inset-bottom));
}

.desktop-header {
    border-bottom-color: var(--card) !important;

    .header-nav .nav-link {
        position: relative;
        border: 0;
        color: var(--secondary-foreground);
        background: transparent;
        font-size: var(--font-size-body);
        line-height: var(--line-height-tight);
        transition: color 0.15s ease, background 0.15s ease;

        &:hover:not(.active):not(.dropdown-profile-pic) {
            background: var(--hover);
        }

        &.active {
            color: var(--primary);
            background: var(--selected);
        }
    }
}

.update-button {
    padding: 0.375rem 1.25rem;
    border: 0;
    border-radius: 0.375rem;
    background: var(--gradient-warning);
    color: var(--primary-foreground);
    font-weight: var(--font-weight-medium);
    text-decoration: none;

    &:hover, &:focus-visible {
        color: var(--primary-foreground);
        background: var(--gradient-warning-active);
    }
}

// Profile Pic Button with Dropdown
.nav-link.dropdown-profile-pic {
    cursor: pointer;
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0.25rem 0.55rem 0.25rem 0.3rem;
    border-radius: 0.5rem;
    color: var(--secondary-foreground);
    background: transparent;
    user-select: none;
    transition: color 0.15s ease, background 0.15s ease;

    &:hover,
    &.is-open {
        background: var(--hover);
    }

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--border);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        font-weight: var(--font-weight-bold);
        font-size: var(--font-size-meta-sm);
        letter-spacing: 0.02em;
        transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }

    &:hover .profile-pic,
    &.is-open .profile-pic {
        border-color: var(--ring);
    }

    svg {
        font-size: 0.75rem;
        opacity: 0.7;
        transition: transform 0.15s ease, opacity 0.15s ease;
    }

    &:hover svg,
    &.is-open svg {
        opacity: 1;
    }

    &.is-open svg {
        transform: rotate(180deg);
    }
}

// Profile dropdown panel lives in a teleport, so it needs a global style block
</style>

<style lang="scss">
.profile-menu.floating-menu-panel {
    min-width: 16rem;
    padding: 0.35rem;
}

.profile-menu a.floating-menu-item:not(.active):hover,
.profile-menu a.floating-menu-item:not(.active):focus-visible {
    color: var(--card-foreground);
}

.profile-menu a.floating-menu-item.active {
    color: var(--primary);
}

.profile-menu .floating-menu-text,
.profile-menu .dropdown-item-text {
    color: var(--muted-foreground);
    font-size: var(--font-size-body-sm);
    opacity: 1;
}

.profile-menu .floating-menu-text strong,
.profile-menu .dropdown-item-text strong {
    color: var(--foreground);
    font-weight: var(--font-weight-semibold);
}
</style>
