<script lang="ts" setup>
// @ts-ignore
const emit = defineEmits<{
    (event: `back`): void;
    (event: `proceed`): void;
}>();

const { progress, scan } = useBloc();

const tab = useTab();

const isMultiPageScan = computed(() => scan.mode === "multi");
const currentPageInfo = computed(() => {
    if (!isMultiPageScan.value) return "";

    const urls = scan.urlList
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean);
    const currentPage = Math.floor(progress.numerator / 75); // Assuming 75 steps per page
    return currentPage < urls.length ? urls[currentPage] : "";
});
</script>

<template>
    <div class="view">
        <div class="view__content">
            <app-copy
                type="Title/h1"
                color="f6"
                v-text="
                    isMultiPageScan ? `Scanning pages...` : `Scanning page...`
                "
            />

            <app-copy
                type="Title/h3"
                color="cd"
                class="view__subheader"
                v-text="isMultiPageScan ? currentPageInfo : tab.url"
            />

            <app-copy type="Title/h3" color="cd" v-text="progress.message" />

            <app-progress-bar
                class="view__progress"
                :numerator="progress.numerator"
                :denominator="progress.denominator"
            />

            <app-copy
                type="Title/h4"
                color="cd"
                class="view__reminder"
                v-text="
                    `This will take a few minutes, please keep the extension pop-up open`
                "
            />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.view {
    display: grid;
    height: 100%;
    padding-bottom: 3.75rem;

    &__content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        overflow: hidden;
        padding-inline: var(--container-padding);
        row-gap: 44px;
    }

    &__subheader {
        margin-top: -2rem;
    }

    &__reminder {
        max-width: 56%;
        text-align: center;
        margin-top: -1rem;
    }

    &__progress {
        width: 100%;
        max-width: 460px;
    }
}
</style>
