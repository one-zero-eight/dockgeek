<template>
    <!-- Compact: no desktop chrome — pages fill <main> directly -->
    <router-view v-if="$root.isCompact" :key="$route.fullPath" />

    <!-- Desktop: sticky sidebar + independent content scroll -->
    <div v-else class="dashboard relative flex gap-4 w-full h-full min-h-0 pl-3" :class="{ 'home-route': showProjectsSidebar }">
        <template v-if="showProjectsSidebar">
            <aside v-show="!sidebarCollapsed" id="projects-sidebar" class="dashboard-sidebar sticky top-0 flex flex-col h-full min-h-0 max-w-[360px] min-w-[260px] self-start pt-3 pb-4">
                <div class="sidebar-heading mb-[1rem] flex flex-none items-center gap-4">
                    <h1 class="mb-0">{{ $t("stacks") }}</h1>
                    <router-link to="/compose" class="add-stack inline-flex flex-none items-center justify-center w-8 h-8 p-0 rounded-full border border-primary bg-primary bg-gradient-primary text-primary-foreground no-underline hover:bg-gradient-primary-active" :aria-label="$t('newProject')" :title="$t('newProject')">
                        <font-awesome-icon icon="plus" />
                    </router-link>
                </div>
                <div class="sidebar-list-wrap relative flex flex-1 flex-col min-h-0">
                    <StackList :scrollbar="true" />
                </div>
                <button
                    type="button"
                    class="sidebar-rail-toggle is-collapse"
                    :aria-label="$t('collapseProjects')"
                    :title="$t('collapseProjects')"
                    aria-controls="projects-sidebar"
                    :aria-expanded="true"
                    @click="sidebarCollapsed = true"
                >
                    <font-awesome-icon icon="chevron-left" />
                </button>
            </aside>

            <button
                v-if="sidebarCollapsed"
                type="button"
                class="sidebar-rail-toggle is-reopen"
                :aria-label="$t('expandProjects')"
                :title="$t('expandProjects')"
                aria-controls="projects-sidebar"
                :aria-expanded="false"
                @click="sidebarCollapsed = false"
            >
                <font-awesome-icon icon="chevron-right" />
            </button>
        </template>

        <div class="dashboard-content flex-1 min-w-0 min-h-0 h-full overflow-y-auto overflow-x-hidden overscroll-contain pt-3 pe-3 pb-4" :class="{ 'main-expanded': !showProjectsSidebar || sidebarCollapsed }">
            <router-view :key="$route.fullPath" />
        </div>
    </div>
</template>

<script>
import StackList from "../components/StackList.vue";

export default {
    components: {
        StackList,
    },
    data() {
        return {
            sidebarCollapsed: false,
        };
    },
    computed: {
        /**
         * Projects sidebar belongs to Home and its nested views (compose, containers, terminals).
         * @returns {boolean} Whether the projects sidebar should render.
         */
        showProjectsSidebar() {
            return this.$route.matched.some((record) => record.name === "DashboardHome");
        },
    },
};
</script>

<style lang="scss" scoped>
.add-stack {
    &:hover { color: var(--primary-foreground); }
    &:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
}

.dashboard-sidebar {
    flex: 0 0 28%;
}

.sidebar-rail-toggle {
    z-index: 10;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    color: var(--muted-foreground);
    background: var(--card);
    font-size: 0.65rem;
    line-height: 1;
    appearance: none;
    transition: color 0.15s ease, background 0.15s ease;

    &:hover,
    &:focus-visible {
        color: var(--primary-foreground);
        background: var(--gradient-primary);
        outline: none;
    }
}

.sidebar-rail-toggle.is-collapse {
    position: absolute;
    top: 50%;
    right: 0;
    // Sit on the gutter between sidebar and content
    transform: translate(50%, -50%);
}

.sidebar-rail-toggle.is-reopen {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    // Match full-pill end caps (half of width), not half of height
    border-radius: 0 9px 9px 0;
    color: var(--primary-foreground);
    background: var(--gradient-primary);

    &:hover,
    &:focus-visible {
        background: var(--gradient-primary-active);
    }
}

.dashboard-sidebar > .sidebar-list-wrap > :deep(.stack-list-box) {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
    max-height: none;
    position: static;
    margin-bottom: 0 !important;
}

.dashboard-content.main-expanded {
    flex-basis: 100%;
}
</style>
