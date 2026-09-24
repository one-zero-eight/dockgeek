<template>
    <div class="panel-box stack-list-box flex h-full min-h-0 w-full flex-col lg:sticky lg:top-0 lg:max-h-full">
        <div class="list-header -m-[10px] mb-[10px] rounded-t-[10px] border-b border-border bg-card p-[10px] max-[770px]:p-[8px]">
            <div class="flex items-center justify-between gap-[.5rem]">
                <!-- TODO -->
                <button
                    v-if="false" class="selection-button ms-[.5rem]" :class="{ 'active': selectMode }" type="button"
                    @click="selectMode = !selectMode"
                >
                    {{ $t("Select") }}
                </button>

                <div class="relative min-w-0 flex-[1_1_auto]">
                    <a v-if="searchText == ''" class="search-icon absolute top-0 start-0 flex h-[38px] items-center p-[10px] text-muted-foreground">
                        <font-awesome-icon icon="search" />
                    </a>
                    <a v-if="searchText != ''" class="search-icon absolute top-0 start-0 flex h-[38px] cursor-pointer items-center p-[10px] text-muted-foreground" @click="clearSearchText">
                        <font-awesome-icon icon="times" />
                    </a>
                    <form>
                        <input v-model="searchText" class="search-input h-[38px] w-full rounded-[10px] border border-border bg-input-surface px-[.75rem] py-[.375rem] ps-[2.25rem] text-foreground focus-visible:outline-[2px] focus-visible:outline-ring focus-visible:outline-offset-[1px]" autocomplete="off" />
                    </form>
                </div>
            </div>

            <!-- TODO -->
            <div v-if="false" class="flex items-center">
                <!--<StackListFilter :filterState="filterState" @update-filter="updateFilter" />-->
            </div>

            <!-- TODO: Selection Controls -->
            <div v-if="selectMode && false" class="selection-controls px-[.5rem] pt-[.5rem]">
                <input v-model="selectAll" class="select-input" type="checkbox" />

                <button class="selection-button" @click="pauseDialog">
                    <font-awesome-icon icon="pause" size="sm" /> {{
                        $t("Pause") }}
                </button>
                <button class="selection-button" @click="resumeSelected">
                    <font-awesome-icon icon="play" size="sm" />
                    {{ $t("Resume") }}
                </button>

                <span v-if="selectedStackCount > 0">
                    {{ $t("selectedStackCount", [selectedStackCount]) }}
                </span>
            </div>
        </div>
        <div ref="stackList" class="min-h-0 flex-[1_1_auto]" :class="{ 'overflow-y-auto overscroll-contain': scrollbar }">
            <div v-if="agentStackList[0] && agentStackList[0].stacks.length === 0" class="mt-[1rem] text-center">
                <router-link to="/compose">{{ $t("addFirstStackMsg") }}</router-link>
            </div>
            <div v-for="(agent, agentIndex) in agentStackList" :key="agentIndex" class="stack-list-inner">
                <div
                    v-if="$root.agentCount > 1" class="agent-select flex cursor-pointer select-none items-center text-muted-foreground text-sm font-medium px-[10px] py-[.5rem]"
                    @click="closedAgents.set(agent.endpoint, !closedAgents.get(agent.endpoint))"
                >
                    <span class="me-[.25rem]">
                        <font-awesome-icon v-show="closedAgents.get(agent.endpoint)" icon="chevron-circle-right" />
                        <font-awesome-icon v-show="!closedAgents.get(agent.endpoint)" icon="chevron-circle-down" />
                    </span>
                    <span v-if="agent.endpoint === 'current'">{{ $t("currentEndpoint") }}</span>
                    <span v-else>{{ agent.endpoint }}</span>
                </div>
                <div v-show="$root.agentCount === 1 || !closedAgents.get(agent.endpoint)">
                    <div v-if="$root.stacksDirectoryPaths[agent.endpoint]" class="directory-heading flex min-h-[34px] items-center gap-[8px] px-[6px] py-[3px] text-foreground text-base font-normal">
                        <font-awesome-icon icon="folder-open" />
                        <span :title="$root.stacksDirectoryPaths[agent.endpoint]"><bdi dir="ltr">{{ $root.stacksDirectoryPaths[agent.endpoint] }}</bdi></span>
                    </div>
                    <StackListItem
                        v-for="item in agent.stacks"
                        :key="item.name" :stack="item" :isSelectMode="selectMode"
                        :isSelected="isSelected" :select="select" :deselect="deselect"
                    />
                </div>
            </div>
        </div>
    </div>

    <Confirm ref="confirmPause" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="pauseSelected">
        {{ $t("pauseStackMsg") }}
    </Confirm>
</template>

<script>
import Confirm from "../components/Confirm.vue";
import StackListItem from "../components/StackListItem.vue";
import { CREATED_FILE, CREATED_STACK, EXITED, RUNNING, STOPPED, UNKNOWN } from "../../../common/util-common";

export default {
    components: {
        Confirm,
        StackListItem,
    },
    props: {
        /** Should the scrollbar be shown */
        scrollbar: {
            type: Boolean,
        },
    },
    data() {
        return {
            searchText: "",
            selectMode: false,
            selectAll: false,
            disableSelectAllWatcher: false,
            selectedStacks: {},
            filterState: {
                status: null,
                active: null,
                tags: null,
            },
            closedAgents: new Map(),
        };
    },
    computed: {
        /**
         * Returns a sorted list of stacks based on the applied filters and search text.
         * @returns {Array} The sorted list of stacks.
         */
        agentStackList() {
            let result = Object.values(this.$root.completeStackList);

            result = result.filter(stack => {
                // filter by search text
                // finds stack name, tag name or tag value
                let searchTextMatch = true;
                if (this.searchText !== "") {
                    const loweredSearchText = this.searchText.toLowerCase();
                    searchTextMatch =
                        stack.name.toLowerCase().includes(loweredSearchText)
                        || stack.tags.find(tag => tag.name.toLowerCase().includes(loweredSearchText)
                            || tag.value?.toLowerCase().includes(loweredSearchText));
                }

                // filter by active
                let activeMatch = true;
                if (this.filterState.active != null && this.filterState.active.length > 0) {
                    activeMatch = this.filterState.active.includes(stack.active);
                }

                // filter by tags
                let tagsMatch = true;
                if (this.filterState.tags != null && this.filterState.tags.length > 0) {
                    tagsMatch = stack.tags.map(tag => tag.tag_id) // convert to array of tag IDs
                        .filter(stackTagId => this.filterState.tags.includes(stackTagId)) // perform Array Intersaction between filter and stack's tags
                        .length > 0;
                }

                return searchTextMatch && activeMatch && tagsMatch;
            });

            result.sort((m1, m2) => {

                // sort by managed by dockge
                if (m1.isManagedByDockge && !m2.isManagedByDockge) {
                    return -1;
                } else if (!m1.isManagedByDockge && m2.isManagedByDockge) {
                    return 1;
                }

                // sort by status
                if (m1.status !== m2.status) {
                    if (m2.status === RUNNING) {
                        return 1;
                    } else if (m1.status === RUNNING) {
                        return -1;
                    } else if (m2.status === EXITED || m2.status === STOPPED) {
                        return 1;
                    } else if (m1.status === EXITED || m1.status === STOPPED) {
                        return -1;
                    } else if (m2.status === CREATED_STACK) {
                        return 1;
                    } else if (m1.status === CREATED_STACK) {
                        return -1;
                    } else if (m2.status === CREATED_FILE) {
                        return 1;
                    } else if (m1.status === CREATED_FILE) {
                        return -1;
                    } else if (m2.status === UNKNOWN) {
                        return 1;
                    } else if (m1.status === UNKNOWN) {
                        return -1;
                    }
                }
                return m1.name.localeCompare(m2.name);
            });

            // Group stacks by endpoint, sorting them so the local endpoint is first
            // and the rest are sorted alphabetically
            result = [
                ...result.reduce((acc, stack) => {
                    const endpoint = stack.endpoint || "current";
                    if (!acc.has(endpoint)) {
                        acc.set(endpoint, []);
                    }
                    acc.get(endpoint).push(stack);
                    return acc;
                }, new Map()).entries()
            ].map(([ endpoint, stacks ]) => ({
                endpoint,
                stacks
            })).sort((a, b) => {
                if (a.endpoint === "current" && b.endpoint !== "current") {
                    return -1;
                } else if (a.endpoint !== "current" && b.endpoint === "current") {
                    return 1;
                }
                return a.endpoint.localeCompare(b.endpoint);
            });

            return result;
        },

        isDarkTheme() {
            return document.body.classList.contains("dark");
        },

        selectedStackCount() {
            return Object.keys(this.selectedStacks).length;
        },

        /**
         * Determines if any filters are active.
         * @returns {boolean} True if any filter is active, false otherwise.
         */
        filtersActive() {
            return this.filterState.status != null || this.filterState.active != null || this.filterState.tags != null || this.searchText !== "";
        }
    },
    watch: {
        searchText() {
            for (let stack of this.agentStackList) {
                if (!this.selectedStacks[stack.id]) {
                    if (this.selectAll) {
                        this.disableSelectAllWatcher = true;
                        this.selectAll = false;
                    }
                    break;
                }
            }
        },
        selectAll() {
            if (!this.disableSelectAllWatcher) {
                this.selectedStacks = {};

                if (this.selectAll) {
                    this.agentStackList.forEach((item) => {
                        this.selectedStacks[item.id] = true;
                    });
                }
            } else {
                this.disableSelectAllWatcher = false;
            }
        },
        selectMode() {
            if (!this.selectMode) {
                this.selectAll = false;
                this.selectedStacks = {};
            }
        },
    },
    methods: {
        /**
         * Clear the search bar
         * @returns {void}
         */
        clearSearchText() {
            this.searchText = "";
        },
        /**
         * Update the StackList Filter
         * @param {object} newFilter Object with new filter
         * @returns {void}
         */
        updateFilter(newFilter) {
            this.filterState = newFilter;
        },
        /**
         * Deselect a stack
         * @param {number} id ID of stack
         * @returns {void}
         */
        deselect(id) {
            delete this.selectedStacks[id];
        },
        /**
         * Select a stack
         * @param {number} id ID of stack
         * @returns {void}
         */
        select(id) {
            this.selectedStacks[id] = true;
        },
        /**
         * Determine if stack is selected
         * @param {number} id ID of stack
         * @returns {bool} Is the stack selected?
         */
        isSelected(id) {
            return id in this.selectedStacks;
        },
        /**
         * Disable select mode and reset selection
         * @returns {void}
         */
        cancelSelectMode() {
            this.selectMode = false;
            this.selectedStacks = {};
        },
        /**
         * Show dialog to confirm pause
         * @returns {void}
         */
        pauseDialog() {
            this.$refs.confirmPause.show();
        },
        /**
         * Pause each selected stack
         * @returns {void}
         */
        pauseSelected() {
            Object.keys(this.selectedStacks)
                .filter(id => this.$root.stackList[id].active)
                .forEach(id => this.$root.getSocket().emit("pauseStack", id, () => { }));

            this.cancelSelectMode();
        },
        /**
         * Resume each selected stack
         * @returns {void}
         */
        resumeSelected() {
            Object.keys(this.selectedStacks)
                .filter(id => !this.$root.stackList[id].active)
                .forEach(id => this.$root.getSocket().emit("resumeStack", id, () => { }));

            this.cancelSelectMode();
        },
    },
};
</script>

<style lang="scss" scoped>
.stack-list-box {
    margin-bottom: 0 !important;
}

.list-header { flex: 0 0 auto; }

.directory-heading {
    svg {
        flex: 0 0 13px;
        width: 13px;
    }

    span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        direction: rtl;
        text-align: left;
    }
}

.search-icon {
    // Clear filter button (X)
    svg[data-icon="times"] {
        cursor: pointer;
        transition: all ease-in-out 0.1s;

        &:hover {
            opacity: 0.5;
        }
    }
}

.stack-item {
    width: 100%;
}

.tags {
    margin-top: 4px;
    padding-left: 67px;
    display: flex;
    flex-wrap: wrap;
    gap: 0;
}

.bottom-style {
    padding-left: 67px;
    margin-top: 5px;
}

.selection-button { padding: 0.35rem 0.65rem; border-radius: 0.375rem; color: var(--secondary-foreground); background: var(--secondary); cursor: pointer; }
.selection-button:hover { background: var(--secondary-hover); }
.select-input { accent-color: var(--primary); }
.selection-controls {
    margin-top: 5px;
    display: flex;
    align-items: center;
    gap: 10px;
}

</style>
