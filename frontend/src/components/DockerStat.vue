<template>
    <div class="stats-container [container-type:inline-size]">
        <div class="text-foreground text-body-sm">
            {{ stat.Name }}
        </div>
        <div class="stats mt-[.25rem] flex justify-between gap-2 [container-type:inline-size] text-muted-foreground text-meta-sm">
            <div class="stat flex flex-col gap-[4px]">
                <div class="stat-label font-semibold">
                    {{ $t('CPU') }}
                </div>
                <div>
                    {{ stat.CPUPerc }}
                </div>
            </div>
            <div class="stat flex flex-col gap-[4px]">
                <div class="stat-label font-semibold">
                    {{ $t('memory') }}
                </div>
                <div>
                    {{ stat.MemUsage }} ({{ stat.MemPerc }})
                </div>
            </div>
            <div class="stat flex flex-col gap-[4px]">
                <div class="stat-label font-semibold">
                    {{ $t('networkIO') }}
                </div>
                <div>
                    {{ stat.NetIO }}
                </div>
            </div>
            <div class="stat flex flex-col gap-[4px]">
                <div class="stat-label font-semibold">
                    {{ $t('blockIO') }}
                </div>
                <div>
                    {{ stat.BlockIO }}
                </div>
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
