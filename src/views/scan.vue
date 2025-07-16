<script lang="ts" setup>
import { DEVICE_TYPE_OPTIONS } from "@/constants";
import backwards from "@/icons/backwards.svg";
import forward from "@/icons/forward.svg";

const emit = defineEmits<{
    (event: `back`): void;
    (event: `proceed`): void;
}>();

const { scan } = useBloc();

const isValidUrlList = computed(() => {
    if (scan.mode === "single") return true;
    if (!scan.urlList.trim()) return false;

    const urls = scan.urlList
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean);
    return (
        urls.length > 0 &&
        urls.every((url) => {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        })
    );
});
</script>

<template>
    <div class="view">
        <div class="view__content">
            <app-scroll-view overrun="0.5rem">
                <app-view-header
                    class="view__header"
                    headline="About the web page"
                    subline="Provide details about the specific web page you'd like me to analyse."
                />

                <div class="view__form">
                    <app-choice
                        v-model="scan.mode"
                        label="Scan mode"
                        hint="Choose whether to scan a single page or multiple pages for a journey audit."
                        required
                        :items="[
                            { slug: 'single', label: 'Single page scan' },
                            {
                                slug: 'multi',
                                label: 'Multi-page journey audit',
                            },
                        ]"
                    />

                    <app-input
                        v-if="scan.mode === 'multi'"
                        v-model="scan.urlList"
                        label="Page URLs"
                        hint="Enter one URL per line for the pages you want to scan in sequence."
                        type="textarea"
                        placeholder="https://example.com/page1&#10;https://example.com/page2&#10;https://example.com/page3"
                        :required="!isValidUrlList"
                    />

                    <app-input
                        v-model="scan.objective"
                        label="Objective"
                        hint="What are your goals for this scan? (e.g., improve usability, increase conversions)."
                        type="text"
                        :required="scan.$validation.objective.required"
                    />

                    <!--                    <app-input -->
                    <!--                        v-model="scan.data" -->
                    <!--                        label="Upload webpage data" -->
                    <!--                        hint="Upload qualitative and/or quantitative data that show how users interact with the specific web page. Upload as CSV, Excel, PDF, JPG, PNG or MP3." -->
                    <!--                        type="file" -->
                    <!--                        :required="scan.$validation.data.required" -->
                    <!--                    /> -->

                    <app-choice
                        v-model="scan.deviceType"
                        label="Device type"
                        hint="Choose the device type you would like to analyse."
                        required
                        :items="DEVICE_TYPE_OPTIONS"
                    />
                </div>

                <div class="view__navigation">
                    <div class="view__navigation-buttons">
                        <app-button
                            label="Back"
                            :icon="backwards"
                            variant="secondary"
                            leader="icon"
                            @click="emit(`back`)"
                        />

                        <app-button
                            label="Next"
                            :icon="forward"
                            variant="primary"
                            wide
                            :disabled="scan.$validation.$invalid"
                            @click="emit(`proceed`)"
                        />
                    </div>

                    <div class="view__navigation-copy">
                        <app-copy
                            type="Label 2"
                            color="cd"
                            v-text="`Step 2 of 2`"
                        />
                    </div>
                </div>
            </app-scroll-view>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.view {
    display: grid;
    height: 100%;

    &__content {
        display: grid;
        gap: 24px;
        height: 100%;
        overflow: hidden;
        padding-inline: var(--container-padding);
    }

    &__form {
        display: grid;
        gap: 25px;
    }

    &__navigation {
        padding-top: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        align-items: center;

        &-buttons {
            display: grid;
            grid-template-columns: 1fr 3fr;
            gap: 27px;
            width: 100%;
        }
    }
}
</style>
