<template>
    <div>
        <form class="my-[1.5rem] first:mt-0" autocomplete="off" @submit.prevent="saveGeneral">
            <!-- Client side Timezone -->
            <div v-if="false" class="mb-[1.5rem]">
                <label for="timezone" class="mb-2 inline-block text-foreground">
                    {{ $t("Display Timezone") }}
                </label>
                <select id="timezone" v-model="$root.userTimezone" class="ui-field min-w-0 max-[575px]:min-h-[44px] text-secondary-foreground text-base">
                    <option value="auto">
                        {{ $t("Auto") }}: {{ guessTimezone }}
                    </option>
                    <option
                        v-for="(timezone, index) in timezoneList"
                        :key="index"
                        :value="timezone.value"
                    >
                        {{ timezone.name }}
                    </option>
                </select>
            </div>

            <!-- Server Timezone -->
            <div v-if="false" class="mb-[1.5rem]">
                <label for="timezone" class="mb-2 inline-block text-foreground">
                    {{ $t("Server Timezone") }}
                </label>
                <select id="timezone" v-model="settings.serverTimezone" class="ui-field min-w-0 max-[575px]:min-h-[44px] text-secondary-foreground text-base">
                    <option value="UTC">UTC</option>
                    <option
                        v-for="(timezone, index) in timezoneList"
                        :key="index"
                        :value="timezone.value"
                    >
                        {{ timezone.name }}
                    </option>
                </select>
            </div>

            <!-- Primary Hostname -->
            <div class="mb-[1.5rem]">
                <label class="mb-2 inline-block text-foreground" for="primaryBaseURL">
                    {{ $t("primaryHostname") }}
                </label>

                <div class="mb-4 flex w-full">
                    <input
                        id="primaryBaseURL"
                        v-model="settings.primaryHostname"
                        class="ui-field min-w-0 flex-1 max-[575px]:min-h-[44px] rounded-e-none text-secondary-foreground text-base"
                        :placeholder="$t(`CurrentHostname`)"
                    />
                    <button class="min-h-[2.375rem] max-[575px]:min-h-[44px] shrink-0 rounded-r-md bg-transparent px-5 py-1.5 text-link cursor-pointer hover:bg-primary-hover hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2" type="button" @click="autoGetPrimaryHostname">
                        {{ $t("autoGet") }}
                    </button>
                </div>
            </div>

            <!-- Save Button -->
            <div>
                <button class="ui-settings-save" type="submit" :disabled="saving">
                    <span class="col-start-1 row-start-1" :class="{ invisible: saving || saved }" :aria-hidden="saving || saved">{{ $t("Save") }}</span>
                    <span class="col-start-1 row-start-1 inline-flex items-center justify-center gap-2" :class="{ invisible: !saving }" :aria-hidden="!saving">
                        <font-awesome-icon icon="spinner" :spin="saving" aria-hidden="true" /> {{ $t("Save") }}
                    </span>
                    <span class="col-start-1 row-start-1 inline-flex items-center justify-center gap-2" :class="{ invisible: !saved }" :aria-hidden="!saved">
                        <font-awesome-icon icon="check" aria-hidden="true" /> {{ $t("Saved") }}
                    </span>
                </button>
            </div>
        </form>
    </div>
</template>

<script>

import dayjs from "dayjs";
import { timezoneList } from "../../util-frontend";

export default {
    components: {

    },

    data() {
        return {
            timezoneList: timezoneList(),
            saving: false,
            saved: false,
            savedTimer: null,
        };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        },
        guessTimezone() {
            return dayjs.tz.guess();
        }
    },

    watch: {
        "settings.primaryHostname"(value, previousValue) {
            if (value !== previousValue) {
                this.resetSaved();
            }
        }
    },

    beforeUnmount() {
        clearTimeout(this.savedTimer);
    },

    methods: {
        resetSaved() {
            clearTimeout(this.savedTimer);
            this.savedTimer = null;
            this.saved = false;
        },
        /** Save the settings */
        saveGeneral() {
            if (this.saving) {
                return;
            }
            this.resetSaved();
            this.saving = true;
            localStorage.timezone = this.$root.userTimezone;
            this.saveSettings((res) => {
                this.saving = false;
                if (res.ok) {
                    this.saved = true;
                    this.savedTimer = setTimeout(() => {
                        this.saved = false;
                        this.savedTimer = null;
                    }, 3000);
                }
            }, undefined, true);
        },
        /** Get the base URL of the application */
        autoGetPrimaryHostname() {
            this.settings.primaryHostname = location.hostname;
        },
    },
};
</script>

