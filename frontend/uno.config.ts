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
