<template>
    <transition name="slide-fade" appear>
        <div class="project-browser flex flex-col flex-1 w-full h-full min-h-0 overflow-hidden">
            <div class="project-browser-heading mb-[1rem] flex flex-none items-center gap-4">
                <h1 class="mb-0">{{ $t("projects") }}</h1>
                <router-link to="/compose" class="ui-add-project" :aria-label="$t('newProject')" :title="$t('newProject')">
                    <font-awesome-icon icon="plus" />
                </router-link>
            </div>
            <ProjectList :scrollbar="true" />
        </div>
    </transition>
</template>

<script>
import ProjectList from "../components/ProjectList.vue";

export default {
    components: { ProjectList },
};
</script>

<style scoped lang="scss">
.project-browser :deep(.project-list-box) {
    flex: 1 1 0;
    position: static;
    width: 100%;
    height: auto;
    max-height: none;
    min-height: 0;
    margin-bottom: 0;
}
</style>
