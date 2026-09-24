<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'">
            <h1 class="mb-[1rem]">
                {{ $t("home") }}
            </h1>

            <div class="first-row -mx-3 flex flex-wrap">
                <!-- Left -->
                <div class="w-full px-3 md:w-7/12 md:flex-none">
                    <!-- Stats -->
                    <div class="panel-box big-padding mb-[1.5rem] text-center p-5">
                        <div class="-mx-3 flex flex-wrap">
                            <div class="min-w-0 flex-1 px-3">
                                <h3>{{ $t("active") }}</h3>
                                <span class="num active block text-[30px] font-bold text-primary">{{ activeNum }}</span>
                            </div>
                            <div class="min-w-0 flex-1 px-3">
                                <h3>{{ $t("exited") }}</h3>
                                <span class="num exited block text-[30px] font-bold text-destructive">{{ exitedNum }}</span>
                            </div>
                            <div class="min-w-0 flex-1 px-3">
                                <h3>{{ $t("inactive") }}</h3>
                                <span class="num inactive block text-[30px] font-bold">{{ inactiveNum }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Right -->
                <div class="w-full px-3 md:w-5/12 md:flex-none">
                    <!-- Agent List -->
                    <div class="panel-box big-padding p-5">
                        <h4 class="mb-[1rem]">{{ $tc("dockgeAgent", 2) }} <span class="status-badge warning-badge">beta</span></h4>

                        <div v-for="(agentItem, endpoint) in $root.agentList" :key="endpoint" class="mb-[1rem] agent">
                            <!-- Agent Status -->
                            <template v-if="$root.agentStatusList[endpoint]">
                                <span v-if="$root.agentStatusList[endpoint] === 'online'" class="status-badge primary-badge me-[.5rem]">{{ $t("agentOnline") }}</span>
                                <span v-else-if="$root.agentStatusList[endpoint] === 'offline'" class="status-badge danger-badge me-[.5rem]">{{ $t("agentOffline") }}</span>
                                <span v-else class="status-badge neutral-badge me-[.5rem]">{{ $t($root.agentStatusList[endpoint]) }}</span>
                            </template>

                            <!-- Agent Display Name -->
                            <template v-if="$root.agentStatusList[endpoint]">
                                <span v-if="endpoint === '' && agentItem.name === ''" class="status-badge neutral-badge me-[.5rem]">Current</span>
                                <span v-else-if="agentItem.name === ''" :href="agentItem.url" class="me-[.5rem]">{{ endpoint }}</span>
                                <span v-else :href="agentItem.url" class="me-[.5rem]">{{ agentItem.name }}</span>
                            </template>

                            <!-- Edit Name  -->
                            <font-awesome-icon v-if="agentItem.name !== ''" icon="pen-to-square" @click="showEditAgentNameDialog[agentItem.name] = !showEditAgentNameDialog[agentItem.Name]" />

                            <!-- Edit Dialog -->
                            <FloatingDialog
                                v-model="showEditAgentNameDialog[agentItem.name]"
                                size="sm"
                                no-close-on-backdrop
                                :title="$t('Update Name')"
                                :ok-title="$t('Update Name')"
                                ok-variant="info"
                                @ok="updateName(agentItem.url, agentItem.updatedName)"
                            >
                                <label for="updatedName" class="field-label">Current value: {{ $t(agentItem.name) }}</label>
                                <input id="updatedName" v-model="agentItem.updatedName" type="text" class="field-control" optional>
                            </FloatingDialog>

                            <!-- Remove Button -->
                            <font-awesome-icon v-if="endpoint !== ''" class="ms-[.5rem] remove-agent" icon="trash" @click="showRemoveAgentDialog[agentItem.url] = !showRemoveAgentDialog[agentItem.url]" />

                            <!-- Remove Agent Dialog -->
                            <FloatingDialog
                                v-model="showRemoveAgentDialog[agentItem.url]"
                                size="sm"
                                :title="$t('removeAgent')"
                                :ok-title="$t('removeAgent')"
                                ok-variant="danger"
                                @ok="removeAgent(agentItem.url)"
                            >
                                <p>{{ agentItem.url }}</p>
                                {{ $t("removeAgentMsg") }}
                            </FloatingDialog>
                        </div>

                        <button v-if="!showAgentForm" class="action-button neutral-button !border-0" @click="showAgentForm = !showAgentForm">{{ $t("addAgent") }}</button>

                        <!-- Add Agent Form -->
                        <form v-if="showAgentForm" @submit.prevent="addAgent">
                            <div class="mb-[1rem]">
                                <label for="url" class="field-label">{{ $t("dockgeURL") }}</label>
                                <input id="url" v-model="agent.url" type="url" class="field-control" required placeholder="http://">
                            </div>

                            <div class="mb-[1rem]">
                                <label for="username" class="field-label">{{ $t("Username") }}</label>
                                <input id="username" v-model="agent.username" type="text" class="field-control" required>
                            </div>

                            <div class="mb-[1rem]">
                                <label for="password" class="field-label">{{ $t("Password") }}</label>
                                <input id="password" v-model="agent.password" type="password" class="field-control" required autocomplete="new-password">
                            </div>

                            <div class="mb-[1rem]">
                                <label for="name" class="field-label">{{ $t("Friendly Name") }}</label>
                                <input id="name" v-model="agent.name" type="text" class="field-control" optional>
                            </div>

                            <button type="submit" class="action-button primary-button" :disabled="connectingAgent">
                                <template v-if="connectingAgent">{{ $t("connecting") }}</template>
                                <template v-else>{{ $t("connect") }}</template>
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </transition>
    <router-view ref="child" />
</template>

<script>
import { statusNameShort } from "../../../common/util-common";
import { FloatingDialog } from "../components/floating";

export default {
    components: {
        FloatingDialog,
    },
    props: {
        calculatedHeight: {
            type: Number,
            default: 0
        }
    },
    data() {
        return {
            page: 1,
            perPage: 25,
            initialPerPage: 25,
            paginationConfig: {
                hideCount: true,
                chunksNavigation: "scroll",
            },
            importantHeartBeatListLength: 0,
            displayedRecords: [],
            showAgentForm: false,
            showRemoveAgentDialog: {},
            showEditAgentNameDialog: {},
            connectingAgent: false,
            agent: {
                url: "http://",
                username: "",
                password: "",
                name: "",
                updatedName: "",
            }
        };
    },

    computed: {
        activeNum() {
            return this.getStatusNum("active");
        },
        inactiveNum() {
            return this.getStatusNum("inactive");
        },
        exitedNum() {
            return this.getStatusNum("exited");
        },
    },

    watch: {
        perPage() {
            this.$nextTick(() => {
                this.getImportantHeartbeatListPaged();
            });
        },

        page() {
            this.getImportantHeartbeatListPaged();
        },
    },

    mounted() {
        this.initialPerPage = this.perPage;

        window.addEventListener("resize", this.updatePerPage);
        this.updatePerPage();
    },

    beforeUnmount() {
        window.removeEventListener("resize", this.updatePerPage);
    },

    methods: {

        addAgent() {
            this.connectingAgent = true;
            this.$root.getSocket().emit("addAgent", this.agent, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        url: "http://",
                        username: "",
                        password: "",
                    };
                }

                this.connectingAgent = false;
            });
        },

        removeAgent(url) {
            this.$root.getSocket().emit("removeAgent", url, (res) => {
                if (res.ok) {
                    this.$root.toastRes(res);

                    let urlObj = new URL(url);
                    let endpoint = urlObj.host;

                    // Remove the stack list and status list of the removed agent
                    delete this.$root.allAgentStackList[endpoint];
                }
            });
        },

        updateName(url, updatedName) {
            this.$root.getSocket().emit("updateAgent", url, updatedName, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        updatedName: "",
                    };
                }
            });
        },

        getStatusNum(statusName) {
            let num = 0;

            for (let stackName in this.$root.completeStackList) {
                const stack = this.$root.completeStackList[stackName];
                if (statusNameShort(stack.status) === statusName) {
                    num += 1;
                }
            }
            return num;
        },

        /**
         * Updates the displayed records when a new important heartbeat arrives.
         * @param {object} heartbeat - The heartbeat object received.
         * @returns {void}
         */
        onNewImportantHeartbeat(heartbeat) {
            if (this.page === 1) {
                this.displayedRecords.unshift(heartbeat);
                if (this.displayedRecords.length > this.perPage) {
                    this.displayedRecords.pop();
                }
                this.importantHeartBeatListLength += 1;
            }
        },

        /**
         * Retrieves the length of the important heartbeat list for all monitors.
         * @returns {void}
         */
        getImportantHeartbeatListLength() {
            this.$root.getSocket().emit("monitorImportantHeartbeatListCount", null, (res) => {
                if (res.ok) {
                    this.importantHeartBeatListLength = res.count;
                    this.getImportantHeartbeatListPaged();
                }
            });
        },

        /**
         * Retrieves the important heartbeat list for the current page.
         * @returns {void}
         */
        getImportantHeartbeatListPaged() {
            const offset = (this.page - 1) * this.perPage;
            this.$root.getSocket().emit("monitorImportantHeartbeatListPaged", null, offset, this.perPage, (res) => {
                if (res.ok) {
                    this.displayedRecords = res.data;
                }
            });
        },

        /**
         * Updates the number of items shown per page based on the available height.
         * @returns {void}
         */
        updatePerPage() {
            const tableContainer = this.$refs.tableContainer;
            const tableContainerHeight = tableContainer.offsetHeight;
            const availableHeight = window.innerHeight - tableContainerHeight;
            const additionalPerPage = Math.floor(availableHeight / 58);

            if (additionalPerPage > 0) {
                this.perPage = Math.max(this.initialPerPage, this.perPage + additionalPerPage);
            } else {
                this.perPage = this.initialPerPage;
            }

        },
    }
};
</script>

<style lang="scss" scoped>
.field-label { display: inline-block; margin-bottom: 0.5rem; color: var(--foreground); }
.field-control {
    display: block;
    width: 100%;
    min-height: 2.375rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--input-surface);
    color: var(--secondary-foreground);
    font-size: var(--font-size-control);

    &:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
}
.action-button {
    min-height: 2.375rem;
    padding: 0.375rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--secondary);
    color: var(--secondary-foreground);
    cursor: pointer;

    &:hover:not(:disabled) { background-color: var(--secondary-hover); }
    &:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
    &:disabled { opacity: 0.65; cursor: not-allowed; }

    &.primary-button {
        border-color: var(--primary);
        background: var(--gradient-primary);
        color: var(--primary-foreground);

        &:hover:not(:disabled) {
            background: var(--gradient-primary-active);
        }
    }
}
.status-badge {
    display: inline-block;
    padding: 0.35em 0.65em;
    border-radius: 0.375rem;
    font-size: var(--font-size-badge);
    font-weight: var(--font-weight-medium);
    line-height: 1;
}
.warning-badge { background: var(--warning); color: var(--primary-foreground); }
.primary-badge { background: var(--primary); color: var(--primary-foreground); }
.danger-badge { background: var(--destructive); color: white; }
.neutral-badge { background: var(--muted); color: var(--foreground); }
@media (max-width: 575px) {
    .field-control, .action-button { min-height: 44px; }
}

table {
    font-size: var(--font-size-body-sm);

    tr {
        transition: all ease-in-out 0.2ms;
    }

    @media (max-width: 550px) {
        table-layout: fixed;
        overflow-wrap: break-word;
    }
}

.remove-agent {
    cursor: pointer;
    color: var(--muted-foreground);
    transition: color 0.15s ease;

    &:hover {
        color: var(--destructive);
    }
}

.agent {
    a {
        text-decoration: none;
    }
}

</style>
