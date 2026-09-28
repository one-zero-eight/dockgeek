import { defineConfig, presetWind4 } from "unocss";

// Keep the app's runtime theme roles and avoid resetting vendor styles.
export default defineConfig({
    presets: [ presetWind4({
        preflights: {
            reset: false,
            property: false,
            theme: true,
        },
    }) ],
    shortcuts: {
        "panel-box": "p-[10px] rounded-[10px] bg-card",
        "big-padding": "p-[20px]",
        "floating-shadow": "shadow-[0_4px_12px_rgba(0,0,0,0.14)]",
        "ui-btn": "inline-flex items-center justify-center gap-1 min-h-[32px] px-3 py-1 rounded-md bg-secondary text-secondary-foreground no-underline cursor-pointer leading-[1.5] hover:bg-secondary-hover hover:text-secondary-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-65 disabled:cursor-not-allowed",
        "ui-btn-sm": "px-[0.6rem] py-[0.35rem] text-sm leading-none",
        "ui-btn-primary": "bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground",
        "ui-btn-gradient-primary": "bg-gradient-primary text-primary-foreground hover:bg-gradient-primary-active hover:text-primary-foreground",
        "ui-btn-provider": "border border-border bg-card text-foreground hover:bg-secondary-hover hover:text-foreground",
        "ui-btn-danger": "bg-destructive text-white hover:text-white",
        "ui-field": "block w-full min-h-[38px] px-3 py-1.5 rounded-md border border-border bg-input-surface text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        "ui-badge": "inline-flex h-5 items-center justify-center rounded-md bg-muted px-2 text-foreground text-xs font-medium leading-none tracking-[.01em] whitespace-nowrap",
        "ui-badge-primary": "bg-primary text-primary-foreground",
        "ui-badge-danger": "bg-destructive text-white",
        "ui-badge-warning": "bg-warning text-primary-foreground",
        "ui-badge-neutral": "bg-muted text-foreground",
        "ui-detail-card": "min-w-0 rounded-[10px] bg-card p-5",
        "ui-detail-label": "mb-[.4rem] text-muted-foreground text-xs font-semibold uppercase",
        "ui-detail-value": "text-base font-semibold",
        "ui-detail-tab": "block cursor-pointer whitespace-nowrap rounded-[.55rem] bg-transparent px-[.9rem] py-2 text-secondary-foreground hover:bg-hover hover:text-link",
        "ui-detail-tab-active": "bg-gradient-primary text-primary-foreground font-semibold",
        "ui-add-project": "inline-flex flex-none items-center justify-center w-8 h-8 p-0 rounded-full bg-primary bg-gradient-primary text-primary-foreground no-underline hover:bg-gradient-primary-active hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        "ui-entity-link": "rounded-[.2rem] text-foreground no-underline [overflow-wrap:anywhere] transition-colors duration-150 hover:text-link focus-visible:text-link focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-[3px]",
        "ui-settings-save": "inline-grid min-w-[5rem] bg-gradient-primary px-5 hover:bg-gradient-primary-active disabled:cursor-wait",
        "ui-floating-field": "block w-full min-h-[3.625rem] rounded-md border border-border bg-input-surface px-[1.3rem] pt-[1.5rem] pb-[.45rem] text-secondary-foreground text-base placeholder:text-transparent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
    },
    rules: [
        [ /^bg-gradient-(primary|success|danger|warning)(-active)?$/, ([ , tone, active ]) => ({
            "background-image": `var(--gradient-${tone}${active || ""})`,
        }) ],
    ],
    theme: {
        font: {
            "app-ui": "var(--font-ui)",
            "app-mono": "var(--font-mono)",
            mono: "var(--font-mono)",
        },
        leading: {
            body: "var(--line-height-body)",
            tight: "var(--line-height-tight)",
        },
        colors: {
            background: "var(--background)",
            foreground: "var(--foreground)",
            link: "var(--link)",
            "primary-hover": "var(--primary-hover)",
            "secondary-hover": "var(--secondary-hover)",
            warning: "var(--warning)",
            hover: "var(--hover)",
            selected: "var(--selected)",
            "input-surface": "var(--input-surface)",
            overlay: "var(--overlay)",
            terminal: {
                background: "var(--terminal-background)",
                bar: "var(--terminal-bar)",
                border: "var(--terminal-border)",
                foreground: "var(--terminal-foreground)",
                strong: "var(--terminal-strong)",
                muted: "var(--terminal-muted)",
            },
            card: {
                DEFAULT: "var(--card)",
                foreground: "var(--card-foreground)",
            },
            popover: {
                DEFAULT: "var(--popover)",
                foreground: "var(--popover-foreground)",
            },
            primary: {
                DEFAULT: "var(--primary)",
                foreground: "var(--primary-foreground)",
            },
            secondary: {
                DEFAULT: "var(--secondary)",
                foreground: "var(--secondary-foreground)",
            },
            muted: {
                DEFAULT: "var(--muted)",
                foreground: "var(--muted-foreground)",
            },
            destructive: {
                DEFAULT: "var(--destructive)",
                foreground: "var(--destructive-foreground)",
            },
            border: "var(--border)",
            input: "var(--input)",
            ring: "var(--ring)",
        },
    },
});
