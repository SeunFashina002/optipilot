<script lang="ts" setup>
const props = defineProps({
    label: String,
    icon: String,
    wide: Boolean,
    disabled: {
        type: Boolean,
        default: false,
    },
    size: {
        type: String,
        default: `regular`,
        validator: (value: string) => {
            return [`xsmall`, `small`, `regular`].includes(value);
        },
    },
    leader: {
        type: String,
        default: `text`,
        validator: (value: string) => {
            return [`icon`, `text`].includes(value);
        },
    },
    variant: {
        type: String,
        default: `primary`,
        validator: (value: string) => {
            return [`primary`, `secondary`].includes(value);
        },
    },
    pending: {
        type: Boolean,
        default: false,
    },
});

const classes = computed(() => {
    return {
        [`button--${props.variant}`]: true,
        [`button--${props.size}`]: true,
        'button--wide': props.wide,
        'button--icon-first': props.leader === `icon`,
        'button--disabled': props.disabled,
        'button--pending': props.pending,
    };
});

const prevent = computed(() =>  props.disabled || props.pending);

const attrs = useAttrs();

</script>

<script lang="ts">
export default {
    inheritAttrs: false,
};
</script>

<template>
    <button
        type="button"
        class="button"
        :class="classes"
        @click="!prevent && attrs.onClick?.()"
    >
        <app-spinner
            v-if="pending"
        />

        <template v-else>
            {{ label }}

            <app-icon
                v-if="icon"
                :name="icon"
            />
        </template>
    </button>
</template>

<style lang="scss">
.button {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-ab);
    border-radius: 1.5rem;
    font-family: Figtree;
    font-weight: 500;
    line-height: 1.5rem;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition: background-color 0.2s;

    svg {
        width: 1.5rem;
        height: 1.5rem;
    }

    &--primary {
        background-color: var(--color-ab);
        color: var(--color-09);

        &:hover {
            background-color: var(--color-ab);
        }
    }

    &--secondary {
        background-color: var(--color-5f);
        color: var(--color-f6);

        &:hover {
            background-color: var(--color-5f);
        }
    }

    &--xsmall {
        padding: 2px 17.5px;
        font-size: 0.75rem;
    }

    &--small {
        padding: 3.24px 17.5px;
        font-size: 1rem;
    }

    &--regular {
        padding: 5.5px 17.5px;
        font-size: 1rem;
    }

    &--wide {
        width: 100%;
        gap:0.5rem;
    }

    &--icon-first {
        flex-direction: row-reverse;
    }

    &--disabled {
        cursor: not-allowed;
        filter: grayscale(1);
    }
}
</style>
