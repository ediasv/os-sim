<script setup lang="ts">
// No visible text, so `label` is required and becomes the accessible name.
// No tooltip in delivery 1 (FE-DEC-11). Availability is the caller's call.
withDefaults(defineProps<{ label: string; disabled?: boolean }>(), {
    disabled: false,
});

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
    <button
        type="button"
        class="ui-icon-button"
        :aria-label="label"
        :disabled="disabled"
        @click="emit('click', $event)"
    >
        <span class="ui-icon-button__icon" aria-hidden="true">
            <slot />
        </span>
    </button>
</template>

<style scoped>
/* Figma "Icon button". Focus uses the global ring from base.css. */
.ui-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    background: var(--color-bg-raised);
    color: var(--color-text-primary);
    cursor: pointer;
}

.ui-icon-button:hover:not(:disabled) {
    background: var(--color-border-default);
}

.ui-icon-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.ui-icon-button__icon {
    display: inline-flex;
    width: 16px;
    height: 16px;
}
</style>
