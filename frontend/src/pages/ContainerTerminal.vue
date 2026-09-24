<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 class="mb-[1rem]">{{ $t("terminal") }} - {{ serviceName }} ({{ stackName }})</h1>

            <div class="mb-[1rem]">
                <router-link :to="sh" class="shell-link me-[.5rem] inline-flex items-center min-h-[38px] px-3 py-[0.375rem] rounded-md border border-secondary bg-secondary text-secondary-foreground no-underline">{{ $t("Switch to sh") }}</router-link>
            </div>

            <Terminal class="terminal" :rows="20" mode="interactive" :name="terminalName" :stack-name="stackName" :service-name="serviceName" :shell="shell" :endpoint="endpoint"></Terminal>
        </div>
    </transition>
</template>

<script>
import { getContainerExecTerminalName } from "../../../common/util-common";

export default {
    components: {
    },
    data() {
        return {

        };
    },
    computed: {
        stackName() {
            return this.$route.params.stackName;
        },
        endpoint() {
            return this.$route.params.endpoint || "";
        },
        shell() {
            return this.$route.params.type;
        },
        serviceName() {
            return this.$route.params.serviceName;
        },
        terminalName() {
            return getContainerExecTerminalName(this.endpoint, this.stackName, this.serviceName, 0, this.shell);
        },
        sh() {
            let endpoint = this.$route.params.endpoint;

            let data = {
                name: "containerTerminal",
                params: {
                    stackName: this.stackName,
                    serviceName: this.serviceName,
                    type: "sh",
                },
            };

            if (endpoint) {
                data.name = "containerTerminalEndpoint";
                data.params.endpoint = endpoint;
            }

            return data;
        },
    },
    mounted() {

    },
    methods: {

    }
};
</script>

<style scoped lang="scss">
.shell-link {
    &:hover { color: var(--secondary-foreground); background: var(--secondary-hover); }
    &:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
}
@media (max-width: 767.98px) { .shell-link { min-height: 44px; } }
.terminal {
    height: 410px;
}

@media (max-width: 991.98px) {
    h1 { overflow-wrap: anywhere; }
    .terminal { height: calc(100dvh - 250px); min-height: 340px; }
}
</style>
