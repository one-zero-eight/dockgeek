import { createRouter, createWebHistory } from "vue-router";

import Layout from "./layouts/Layout.vue";
import Setup from "./pages/Setup.vue";
import Dashboard from "./pages/Dashboard.vue";
import DashboardHome from "./pages/DashboardHome.vue";
import Console from "./pages/Console.vue";
import Project from "./pages/Project.vue";
import ContainerTerminal from "./pages/ContainerTerminal.vue";
import ContainerDetails from "./pages/ContainerDetails.vue";
import Files from "./pages/Files.vue";
import ProjectBrowser from "./pages/ProjectBrowser.vue";

const Settings = () => import("./pages/Settings.vue");

// Settings - Sub Pages
import Appearance from "./components/settings/Appearance.vue";
import General from "./components/settings/General.vue";
const Security = () => import("./components/settings/Security.vue");
const GlobalEnv = () => import("./components/settings/GlobalEnv.vue");
import About from "./components/settings/About.vue";

const routes = [
    {
        path: "/empty",
        component: Layout,
        children: [
            {
                path: "",
                component: Dashboard,
                children: [
                    {
                        name: "DashboardHome",
                        path: "/",
                        component: DashboardHome,
                        children: [
                            {
                                path: "/compose",
                                name: "Compose",
                                component: Project,
                            },
                            {
                                path: "/projects/:projectName/:endpoint",
                                name: "projectEndpoint",
                                component: Project,
                            },
                            {
                                path: "/projects/:projectName",
                                name: "project",
                                component: Project,
                            },
                            {
                                path: "/projects/:projectName/container/:containerName",
                                component: ContainerDetails,
                                name: "containerDetails",
                            },
                            {
                                path: "/projects/:projectName/container/:containerName/:endpoint",
                                component: ContainerDetails,
                                name: "containerDetailsEndpoint",
                            },
                            {
                                path: "/terminal/:projectName/:serviceName/:type",
                                component: ContainerTerminal,
                                name: "containerTerminal",
                            },
                            {
                                path: "/terminal/:projectName/:serviceName/:type/:endpoint",
                                component: ContainerTerminal,
                                name: "containerTerminalEndpoint",
                            },
                        ]
                    },
                    {
                        path: "/console",
                        component: Console,
                    },
                    {
                        path: "/console/:endpoint",
                        component: Console,
                    },
                    {
                        path: "/files",
                        component: Files,
                        name: "files",
                    },
                    {
                        path: "/files/:endpoint",
                        component: Files,
                        name: "filesEndpoint",
                    },
                    {
                        path: "/projects",
                        component: ProjectBrowser,
                        name: "projects",
                    },
                    {
                        path: "/settings",
                        component: Settings,
                        children: [
                            {
                                path: "general",
                                component: General,
                            },
                            {
                                path: "appearance",
                                component: Appearance,
                            },
                            {
                                path: "security",
                                component: Security,
                            },
                            {
                                path: "globalEnv",
                                component: GlobalEnv,
                            },
                            {
                                path: "about",
                                component: About,
                            },
                        ]
                    },
                ]
            },
        ]
    },
    {
        path: "/setup",
        component: Setup,
    },
];

export const router = createRouter({
    linkActiveClass: "active",
    history: createWebHistory(),
    routes,
});
