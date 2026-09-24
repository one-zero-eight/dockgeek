<template>
    <div class="stats-container [container-type:inline-size]">
        <div class="text-foreground text-sm">
            {{ stat.Name }}
        </div>
        <div class="stats mt-[.25rem] flex justify-between gap-2 [container-type:inline-size] text-muted-foreground text-xs">
            <div v-for="metric in metrics" :key="metric.key" class="stat flex flex-col gap-[4px]">
                <div class="stat-label font-semibold">{{ $t(metric.key) }}</div>
                <div>{{ metric.value }}</div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: {
        stat: {
            type: Object,
            required: true
        }
    },
    computed: {
        metrics() {
            return [
                { key: "CPU",
                    value: this.stat.CPUPerc },
                { key: "memory",
                    value: `${this.stat.MemUsage} (${this.stat.MemPerc})` },
                { key: "networkIO",
                    value: this.stat.NetIO },
                { key: "blockIO",
                    value: this.stat.BlockIO },
            ];
        },
    },
};
</script>

<style lang="scss" scoped>
.stats {
    @container (width < 420px) {
        flex-direction: column;

        .stat { flex-direction: row; }
        .stat-label::after { content: ':'; }
    }
}
</style>
