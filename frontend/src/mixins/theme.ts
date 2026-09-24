import { defineComponent } from "vue";

export default defineComponent({
    data() {
        return {
            system: (window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light",
            userTheme: localStorage.theme,
            path: "",
            viewportWidth: window.innerWidth,
        };
    },

    computed: {
        /**
         * Single resolved theme for the whole application.
         */
        theme() {
            if (this.userTheme === "auto") {
                return this.system;
            }
            return this.userTheme;
        },

        isDark() {
            return this.theme === "dark";
        },

        isMobile() {
            return this.viewportWidth < 768;
        },

        isTablet() {
            return this.viewportWidth >= 768 && this.viewportWidth < 992;
        },

        isCompact() {
            return this.viewportWidth < 992;
        },
    },

    watch: {
        "$route.fullPath"(path) {
            this.path = path;
        },

        userTheme(to, from) {
            localStorage.theme = to;
        },

        styleElapsedTime(to, from) {
            localStorage.styleElapsedTime = to;
        },

        theme() {
            this.applyTheme();
        },

        userHeartbeatBar(to, from) {
            localStorage.heartbeatBarTheme = to;
        },

        heartbeatBarTheme(to, from) {
            document.body.classList.remove(from);
            document.body.classList.add(this.heartbeatBarTheme);
        }
    },

    mounted() {
        // Default Dark
        if (! this.userTheme) {
            this.userTheme = "dark";
        }

        this.systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
        this.onSystemThemeChange = (event) => {
            this.system = event.matches ? "dark" : "light";
        };
        this.systemQuery.addEventListener("change", this.onSystemThemeChange);

        this.applyTheme();
        window.addEventListener("resize", this.updateViewportWidth, { passive: true });
    },

    beforeUnmount() {
        this.systemQuery?.removeEventListener("change", this.onSystemThemeChange);
        window.removeEventListener("resize", this.updateViewportWidth);
    },

    methods: {
        /**
         * Push the resolved theme to the DOM.
         *
         * `body.light` / `body.dark` stay because frozen vendor styles (CodeMirror
         * and its tooltips) still key off them; the class is derived from the same
         * resolved theme, never managed separately.
         * @returns {void}
         */
        applyTheme() {
            const theme = this.theme;

            document.body.classList.remove("light", "dark");
            document.body.classList.add(theme);

            const root = document.documentElement;
            root.style.colorScheme = theme;

            this.updateThemeColorMeta();
        },

        /**
         * Derive the browser theme color from the rendered page background.
         * @returns {void}
         */
        updateThemeColorMeta() {
            const meta = document.querySelector("#theme-color");
            if (!meta) {
                return;
            }

            const pageBg = getComputedStyle(document.body).backgroundColor;
            meta.setAttribute("content", pageBg);
        },

        updateViewportWidth() {
            this.viewportWidth = window.innerWidth;
        },
    }
});
