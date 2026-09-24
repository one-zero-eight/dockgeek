<template>
    <div>
        <div class="my-[1.5rem] first:mt-0">
            <label for="language" class="mb-2 inline-block text-foreground">
                {{ $t("Language") }}
            </label>
            <select id="language" v-model="$root.language" class="block w-full max-w-xs min-h-[2.375rem] max-[575px]:min-h-[44px] rounded-md border border-border bg-input-surface px-3 py-1.5 text-secondary-foreground text-base focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
                <option
                    v-for="(lang, i) in $i18n.availableLocales"
                    :key="`Lang${i}`"
                    :value="lang"
                >
                    {{ $i18n.messages[lang].languageName }}
                </option>
            </select>
        </div>
        <div v-show="true" class="my-[1.5rem] first:mt-0 flex flex-col items-start gap-2">
            <div id="theme-label" class="text-foreground">{{ $t("Theme") }}</div>
            <div class="inline-flex shrink-0 overflow-hidden rounded-md border border-border bg-border" role="radiogroup" aria-labelledby="theme-label">
                <span v-for="option in themeOptions" :key="option.value" class="relative inline-flex not-last:border-r border-border">
                    <input
                        :id="`theme-${option.value}`"
                        v-model="$root.userTheme"
                        type="radio"
                        class="peer sr-only"
                        name="theme"
                        :value="option.value"
                    />
                    <label
                        :for="`theme-${option.value}`"
                        class="relative inline-flex min-h-[2.375rem] max-[575px]:min-h-[44px] items-center justify-center bg-card px-3 py-1.5 text-link cursor-pointer hover:bg-hover peer-checked:bg-primary peer-checked:bg-gradient-primary peer-checked:text-primary-foreground peer-focus-visible:z-1 peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:-outline-offset-2"
                    >
                        {{ $t(option.label) }}
                    </label>
                </span>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            themeOptions: [
                {
                    value: "light",
                    label: "Light",
                },
                {
                    value: "dark",
                    label: "Dark",
                },
                {
                    value: "auto",
                    label: "Auto",
                },
            ],
        };
    },
};
</script>
