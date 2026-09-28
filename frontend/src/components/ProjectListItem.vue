<template>
    <div class="project-tree select-none" :class="{ 'opacity-50': !project.isManagedByDockgeek }">
        <div class="project-row relative isolate flex min-w-0 min-h-[34px] items-center cursor-pointer" :class="{ selected: $route.path === url && !$route.hash }" @click.self="project.isManagedByDockgeek && $event.detail <= 1 && changeCollapsed()" @dblclick.prevent="project.isManagedByDockgeek && $event.target !== $event.currentTarget && changeCollapsed()">
            <button class="tree-toggle min-h-[34px] w-[30px] flex-[0_0_30px] rounded-[5px] bg-transparent p-0 text-inherit text-[.8rem]" :class="{ 'unmanaged-toggle': !project.isManagedByDockgeek }" :disabled="!project.isManagedByDockgeek" :aria-expanded="project.isManagedByDockgeek ? !isCollapsed : undefined" :aria-label="projectName" @click="$event.detail <= 1 && changeCollapsed()" @dblclick.stop.prevent>
                <font-awesome-icon icon="chevron-down" :class="{ collapsed: isCollapsed }" />
            </button>
            <router-link :to="url" class="project-link flex min-w-0 min-h-[34px] items-center gap-[8px] px-[4px] py-[3px] text-inherit text-base no-underline">
                <FloatingTooltip placement="right">
                    <template #trigger="{ triggerAttrs }">
                        <span
                            v-bind="triggerAttrs"
                            class="inline-flex flex-[0_0_13px] items-center"
                            :class="`project-tone-${statusColor(project.status)}`"
                            role="img"
                            :aria-label="$t(projectStatus.title)"
                        >
                            <font-awesome-icon icon="layer-group" class="node-icon w-[13px] flex-[0_0_13px]" />
                        </span>
                    </template>
                    <span class="floating-tooltip-title">{{ $t(projectStatus.title) }}</span>
                    <span class="floating-tooltip-detail">{{ projectStatus.detail }}</span>
                </FloatingTooltip>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" :title="projectName">{{ projectName }}</span>
            </router-link>
        </div>
        <ul v-if="project.isManagedByDockgeek && !isCollapsed" class="tree-children">
            <li v-if="loading" class="p-[6px] text-base [overflow-wrap:anywhere]">{{ $t("loading") }}</li>
            <li v-else-if="error" class="p-[6px] text-base [overflow-wrap:anywhere] project-tone-danger" role="alert">{{ error }}</li>
            <li v-else-if="services.length === 0" class="p-[6px] text-base [overflow-wrap:anywhere]">{{ $t("noServices") }}</li>
            <li v-for="service in services" v-else :key="service.name">
                <div class="tree-row relative isolate flex min-w-0 min-h-[34px] items-center cursor-pointer" :class="{ selected: $route.path === url && $route.hash === '#service-' + encodeURIComponent(service.name) }" @click.self="$event.detail <= 1 && service.instances.length && toggleService(service.name)" @dblclick.prevent="$event.target !== $event.currentTarget && service.instances.length && toggleService(service.name)">
                    <button class="tree-toggle min-h-[34px] w-[30px] flex-[0_0_30px] rounded-[5px] bg-transparent p-0 text-inherit text-[.8rem]" :disabled="service.instances.length === 0" :aria-expanded="!collapsedServices.has(service.name)" :aria-label="service.name" @click="$event.detail <= 1 && toggleService(service.name)" @dblclick.stop.prevent>
                        <font-awesome-icon icon="chevron-down" :class="{ collapsed: collapsedServices.has(service.name) }" />
                    </button>
                    <router-link :to="{ path: url, hash: '#service-' + encodeURIComponent(service.name) }" class="tree-link flex min-w-0 min-h-[34px] items-center gap-[8px] px-[4px] py-[3px] text-inherit text-base no-underline">
                        <font-awesome-icon icon="cubes" class="node-icon w-[13px] flex-[0_0_13px]" :class="serviceStatusClass(service)" />
                        <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" :title="service.name">{{ service.name }}</span>
                    </router-link>
                </div>
                <ul v-if="!collapsedServices.has(service.name) && service.instances.length" class="tree-children">
                    <li v-for="instance in service.instances" :key="instance.name">
                        <router-link :to="containerRoute(instance)" class="tree-link container-link relative isolate flex min-w-0 min-h-[34px] items-center gap-[8px] px-[4px] py-[3px] text-inherit text-base no-underline">
                            <FloatingTooltip placement="right">
                                <template #trigger="{ triggerAttrs }">
                                    <span
                                        v-bind="triggerAttrs"
                                        class="inline-flex flex-[0_0_13px] items-center"
                                        :class="instanceStatusClass(instance)"
                                    >
                                        <font-awesome-icon icon="cube" class="node-icon w-[13px] flex-[0_0_13px]" />
                                    </span>
                                </template>
                                <span class="floating-tooltip-detail">{{ instanceTitle(instance) }}</span>
                            </FloatingTooltip>
                            <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" :title="instance.name">{{ instance.name }}</span>
                        </router-link>
                    </li>
                </ul>
            </li>
        </ul>
    </div>
</template>

<script>
import { parse } from "yaml";
import { statusColor, projectStatusDetail, projectStatusTitle, containerStatusTone, formatContainerError } from "../../../common/util-common";
import { FloatingTooltip } from "./floating";

export default {
    components: {
        FloatingTooltip,
    },
    props: {
        /** Project this represents */
        project: {
            type: Object,
            default: null,
        },
        /** If the user is in select mode */
        isSelectMode: {
            type: Boolean,
            default: false,
        },
        /** How many ancestors are above this project */
        depth: {
            type: Number,
            default: 0,
        },
        /** Callback to determine if project is selected */
        isSelected: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when project is selected */
        select: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when project is deselected */
        deselect: {
            type: Function,
            default: () => {}
        },
    },
    data() {
        return {
            statusColor,
            isCollapsed: true,
            collapsedServices: new Set(),
            services: [],
            loading: false,
            error: "",
            refreshTimer: null,
            requestVersion: 0,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.project.endpoint);
        },
        url() {
            if (this.project.endpoint) {
                return `/projects/${this.project.name}/${this.project.endpoint}`;
            } else {
                return `/projects/${this.project.name}`;
            }
        },
        depthMargin() {
            return {
                marginLeft: `${31 * this.depth}px`,
            };
        },
        projectName() {
            return this.project.name;
        },
        /**
         * Status tooltip of the project: a sentence plus the raw compose status.
         * @returns {object}
         */
        projectStatus() {
            return {
                title: projectStatusTitle(this.project),
                detail: this.formatProjectStatusDetail(this.project),
            };
        },
    },
    watch: {
        isSelectMode() {
            // TODO: Resize the heartbeat bar, but too slow
            // this.$refs.heartbeatBar.resize();
        }
    },
    beforeUnmount() {
        this.requestVersion++;
        clearTimeout(this.refreshTimer);
    },
    methods: {
        /**
         * Localize the status detail line under the project icon tooltip.
         * Compose statuses are shown as "containers running(1), …".
         * @param {object|null|undefined} project Project status payload.
         * @returns {string}
         */
        formatProjectStatusDetail(project) {
            if (project?.composeStatus) {
                return this.$t("projectStatusContainers", { status: project.composeStatus });
            }
            const detail = projectStatusDetail(project);
            return this.$te(detail) ? this.$t(detail) : detail;
        },
        instanceStatusClass(instance) {
            return `project-tone-${containerStatusTone(instance)}`;
        },
        serviceStatusClass(service) {
            if (service.instances.some((instance) => formatContainerError(instance))) {
                return "project-tone-danger";
            }
            if (service.instances.some((instance) => instance.state === "running")) {
                return "project-tone-primary";
            }
            return "project-tone-secondary";
        },
        instanceTitle(instance) {
            const parts = [ instance.statusDetail || instance.status ];
            const error = formatContainerError(instance);
            if (error) {
                parts.push(error);
            }
            return parts.join(", ");
        },
        changeCollapsed() {
            if (!this.project.isManagedByDockgeek) {
                return;
            }
            this.isCollapsed = !this.isCollapsed;
            this.requestVersion++;
            clearTimeout(this.refreshTimer);
            if (!this.isCollapsed) {
                this.loadServices();
            }
        },
        toggleService(name) {
            if (this.collapsedServices.has(name)) {
                this.collapsedServices.delete(name);
            } else {
                this.collapsedServices.add(name);
            }
        },
        containerRoute(instance) {
            const params = { projectName: this.project.name,
                containerName: instance.name };
            if (this.project.endpoint) {
                params.endpoint = this.project.endpoint;
            }
            return {
                name: this.project.endpoint ? "containerDetailsEndpoint" : "containerDetails",
                params,
            };
        },
        requestTreeData(event) {
            return new Promise((resolve, reject) => {
                this.$root.getSocket().timeout(10000).emit("agent", this.project.endpoint, event, this.project.name, (error, res) => {
                    if (error) {
                        reject(error);
                    } else if (!res.ok) {
                        reject(new Error(res.msg));
                    } else {
                        resolve(res);
                    }
                });
            });
        },
        async loadServices() {
            const version = ++this.requestVersion;
            this.loading = this.services.length === 0;
            this.error = "";
            try {
                const [ projectResponse, statusResponse ] = await Promise.all([
                    this.requestTreeData("getProject"),
                    this.requestTreeData("serviceStatusList"),
                ]);
                if (version !== this.requestVersion) {
                    return;
                }
                const config = parse(projectResponse.project.composeYAML);
                const statuses = statusResponse.serviceStatusList;
                const names = new Set([ ...Object.keys(config?.services || {}), ...Object.keys(statuses) ]);
                this.services = [ ...names ].sort((a, b) => a.localeCompare(b)).map(name => ({
                    name,
                    instances: (statuses[name] || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
                }));
            } catch (error) {
                if (version === this.requestVersion) {
                    this.error = error.message;
                }
            } finally {
                if (version === this.requestVersion) {
                    this.loading = false;
                    this.refreshTimer = setTimeout(() => this.loadServices(), 10000);
                }
            }
        },

        /**
         * Toggle selection of project
         * @returns {void}
         */
        toggleSelection() {
            if (this.isSelected(this.project.id)) {
                this.deselect(this.project.id);
            } else {
                this.select(this.project.id);
            }
        },
    },
};
</script>

<style lang="scss" scoped>
.project-tone-primary { color: var(--primary); }
.project-tone-warning { color: var(--warning); }
.project-tone-danger { color: var(--destructive); }
.project-tone-stopped { color: var(--warning); }
.project-tone-secondary { color: var(--muted-foreground); }

.project-tree {
    --tree-indent: 0px;
}

.project-row,
.tree-row,
.container-link {
    margin-inline-start: calc(-1 * var(--tree-indent));
    padding-inline-start: var(--tree-indent);

    &::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 3px;
        z-index: -1;
        pointer-events: none;
    }

    &:hover::before,
    &:focus-within::before {
        background: var(--hover);
    }

    &.selected::before,
    &.container-link.active::before {
        background: var(--selected);
    }
}

.tree-row > .tree-link {
    flex: 1;
}

.tree-toggle {
    &:disabled:not(.unmanaged-toggle) {
        visibility: hidden;
    }

    &.unmanaged-toggle:disabled {
        opacity: 0.35;
        cursor: default;
    }
}

.tree-children {
    --tree-indent: 16px;

    list-style: none;
    margin: 0;
    padding: 0 0 0 16px;

    .tree-children {
        --tree-indent: 32px;
    }
}

.container-link {
    padding-inline-start: calc(var(--tree-indent) + 34px);
}

.project-row .project-link {
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
}

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.collapse-padding {
    padding-left: 8px !important;
    padding-right: 2px !important;
}

.collapsed {
    transform: rotate(-90deg);
}

.animated {
    transition: all 0.2s cubic-bezier(0.54, 0.78, 0.55, 0.97);
}

.select-input-wrapper {
    float: left;
    margin-top: 15px;
    margin-left: 3px;
    margin-right: 10px;
    padding-left: 4px;
    position: relative;
    z-index: 15;
}

</style>
