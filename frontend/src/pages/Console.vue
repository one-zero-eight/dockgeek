<template>
    <transition name="slide-fade" appear>
        <div v-if="!processing">
            <Terminal v-if="enableConsole" class="terminal" :rows="20" mode="mainTerminal" name="console" :endpoint="endpoint"></Terminal>

            <div v-else class="console-notice panel-box p-4 border border-warning rounded-md text-foreground bg-card" role="alert">
                <h4 class="console-notice-heading mb-2">{{ $t("Console is not enabled") }}</h4>
                <i18n-t keypath="ConsoleNotEnabledMSG1" tag="p">
                    <template #docker><code class="bg-muted text-foreground">{{ $t('dockerCode') }}</code></template>
                    <template #rm><code class="bg-muted text-foreground">{{ $t('rmCode') }}</code></template>
                </i18n-t>

                <i18n-t keypath="ConsoleNotEnabledMSG2" tag="p">
                    <template #rmRf>
                        <code class="bg-muted text-foreground">{{ $t('rmRfCode') }}</code>
                    </template>
                </i18n-t>

                <i18n-t keypath="ConsoleNotEnabledMSG3" tag="p">
                    <template #envVar>
                        <code class="bg-muted text-foreground">{{ $t('envVarCode') }}</code>
                    </template>
                </i18n-t>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    components: {
    },
    data() {
        return {
            processing: true,
            enableConsole: false,
        };
    },
    computed: {
        endpoint() {
            return this.$route.params.endpoint || "";
        },
    },
    mounted() {
        this.$root.emitAgent(this.endpoint, "checkMainTerminal", (res) => {
            this.enableConsole = res.ok;
            this.processing = false;
        });
    },
    methods: {

    }
};
</script>

<style scoped lang="scss">
.terminal {
    height: 410px;
}

@media (max-width: 991.98px) {
    .terminal {
        height: calc(100dvh - 190px);
        min-height: 360px;
    }
}
</style>
