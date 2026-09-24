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
                    <div class="panel-box mb-[1.5rem] text-center p-5">
                        <div class="-mx-3 flex flex-wrap">
                            <div v-for="summary in stackSummaries" :key="summary.key" class="min-w-0 flex-1 px-3">
                                <h3>{{ $t(summary.key) }}</h3>
                                <span class="num block text-3xl font-bold" :class="summary.color">{{ summary.value }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Right -->
                <div class="w-full px-3 md:w-5/12 md:flex-none">
                    <!-- Agent List -->
                    <div class="panel-box p-5">
                        <h4 class="mb-[1rem]">{{ $tc("dockgeAgent", 2) }} <span class="ui-badge ui-badge-warning">beta</span></h4>

                        <div v-for="(agentItem, endpoint) in $root.agentList" :key="endpoint" class="mb-[1rem] agent">
                            <!-- Agent Status -->
                            <template v-if="$root.agentStatusList[endpoint]">
                                <span v-if="$root.agentStatusList[endpoint] === 'online'" class="ui-badge ui-badge-primary me-[.5rem]">{{ $t("agentOnline") }}</span>
                                <span v-else-if="$root.agentStatusList[endpoint] === 'offline'" class="ui-badge ui-badge-danger me-[.5rem]">{{ $t("agentOffline") }}</span>
                                <span v-else class="ui-badge ui-badge-neutral me-[.5rem]">{{ $t($root.agentStatusList[endpoint]) }}</span>
                            </template>

                            <!-- Agent Display Name -->
                            <template v-if="$root.agentStatusList[endpoint]">
                                <span v-if="endpoint === '' && agentItem.name === ''" class="ui-badge ui-badge-neutral me-[.5rem]">{{ $t("Current") }}</span>
                                <span v-else-if="agentItem.name === ''" :href="agentItem.url" class="me-[.5rem]">{{ endpoint }}</span>
                                <span v-else :href="agentItem.url" class="me-[.5rem]">{{ agentItem.name }}</span>
                            </template>

                            <!-- Edit Name  -->
                            <button v-if="agentItem.name !== ''" type="button" class="inline-flex items-center rounded text-muted-foreground hover:text-link focus-visible:outline-2 focus-visible:outline-ring" :aria-label="$t('Update Name')" @click="showEditAgentNameDialog[endpoint] = true"><font-awesome-icon icon="pen-to-square" /></button>

                            <!-- Edit Dialog -->
                            <FloatingDialog
                                v-model="showEditAgentNameDialog[endpoint]"
                                size="sm"
                                no-close-on-backdrop
                                :title="$t('Update Name')"
                                :ok-title="$t('Update Name')"
                                ok-variant="info"
                                @ok="updateName(agentItem.url, agentItem.updatedName)"
                            >
                                <label for="updatedName" class="field-label">{{ $t("Current value") }}: {{ agentItem.name }}</label>
                                <input id="updatedName" v-model="agentItem.updatedName" type="text" class="ui-field" optional>
                            </FloatingDialog>

                            <!-- Remove Button -->
                            <button v-if="endpoint !== ''" type="button" class="remove-agent ms-[.5rem] rounded bg-transparent focus-visible:outline-2 focus-visible:outline-ring" :aria-label="$t('removeAgent')" @click="showRemoveAgentDialog[agentItem.url] = true"><font-awesome-icon icon="trash" /></button>

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

                        <button v-if="!showAgentForm" class="ui-btn" @click="showAgentForm = !showAgentForm">{{ $t("addAgent") }}</button>

                        <!-- Add Agent Form -->
                        <form v-if="showAgentForm" @submit.prevent="addAgent">
                            <div class="mb-[1rem]">
                                <label for="url" class="field-label">{{ $t("dockgeURL") }}</label>
                                <input id="url" v-model="agent.url" type="url" class="ui-field" required placeholder="http://">
                            </div>

                            <div class="mb-[1rem]">
                                <label for="username" class="field-label">{{ $t("Username") }}</label>
                                <input id="username" v-model="agent.username" type="text" class="ui-field" required>
                            </div>

                            <div class="mb-[1rem]">
                                <label for="password" class="field-label">{{ $t("Password") }}</label>
                                <input id="password" v-model="agent.password" type="password" class="ui-field" required autocomplete="new-password">
                            </div>

                            <div class="mb-[1rem]">
                                <label for="name" class="field-label">{{ $t("Friendly Name") }}</label>
                                <input id="name" v-model="agent.name" type="text" class="ui-field" optional>
                            </div>

                            <button type="submit" class="ui-btn ui-btn-gradient-primary px-5" :disabled="connectingAgent">
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
        stackSummaries() {
            return [
                { key: "active",
                    value: this.activeNum,
                    color: "text-primary" },
                { key: "exited",
                    value: this.exitedNum,
                    color: "text-destructive" },
                { key: "inactive",
                    value: this.inactiveNum,
                    color: "" },
            ];
        },
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
@media (max-width: 575px) {
    .ui-field, .ui-btn { min-height: 44px; }
}

table {
    font-size: var(--text-sm-fontSize);

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
