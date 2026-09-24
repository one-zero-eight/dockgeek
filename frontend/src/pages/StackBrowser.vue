<template>
    <transition name="slide-fade" appear>
        <div class="stack-browser flex flex-col flex-1 w-full h-full min-h-0 overflow-hidden">
            <div class="stack-browser-heading mb-[1rem] flex flex-none items-center gap-4">
                <h1 class="mb-0">{{ $t("stacks") }}</h1>
                <router-link to="/compose" class="add-stack inline-flex flex-none items-center justify-center w-8 h-8 p-0 rounded-full border border-primary bg-primary bg-gradient-primary text-primary-foreground no-underline hover:bg-gradient-primary-active" :aria-label="$t('newProject')" :title="$t('newProject')">
                    <font-awesome-icon icon="plus" />
                </router-link>
            </div>
            <StackList :scrollbar="true" />
        </div>
    </transition>
</template>

<script>
import StackList from "../components/StackList.vue";

export default {
    components: { StackList },
};
</script>

<style scoped lang="scss">
.add-stack {
    &:hover { color: var(--primary-foreground); }
    &:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
}

.stack-browser :deep(.stack-list-box) {
    flex: 1 1 0;
    position: static;
    width: 100%;
    height: auto;
    max-height: none;
    min-height: 0;
    margin-bottom: 0;
}
</style>
