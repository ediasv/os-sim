<script setup lang="ts">
import { computed, useId } from 'vue';

// Labelled text field (Figma "Field"): label, input with an optional unit,
// a hint and, when the owner passes one, the reason the value was refused.
// It keeps what the user typed as text and decides nothing about validity.
const props = withDefaults(
    defineProps<{
        label: string;
        hint?: string;
        error?: string;
        unit?: string;
        disabled?: boolean;
        numeric?: boolean;
    }>(),
    { hint: undefined, error: undefined, unit: undefined, numeric: false },
);

const model = defineModel<string>({ required: true });

const id = useId();
const hintId = computed(() => `${id}-hint`);
const errorId = computed(() => `${id}-error`);
const describedBy = computed(
    () =>
        [props.error ? errorId.value : null, props.hint ? hintId.value : null]
            .filter(Boolean)
            .join(' ') || undefined,
);
</script>

<template>
    <div class="ui-field" :class="{ 'ui-field--invalid': error }">
        <label class="ui-field__label" :for="id">{{ label }}</label>
        <div class="ui-field__control">
            <input
                :id="id"
                v-model="model"
                class="ui-field__input"
                type="text"
                :inputmode="numeric ? 'numeric' : undefined"
                autocomplete="off"
                :disabled="disabled"
                :aria-invalid="error ? 'true' : undefined"
                :aria-describedby="describedBy"
            />
            <span v-if="unit" class="ui-field__unit">{{ unit }}</span>
        </div>
        <p v-if="error" :id="errorId" class="ui-field__error">{{ error }}</p>
        <p v-if="hint" :id="hintId" class="ui-field__hint">{{ hint }}</p>
    </div>
</template>

<style scoped>
.ui-field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2xs);
    min-width: 0;
}

.ui-field__label {
    font: var(--font-label-sm);
    color: var(--color-text-secondary);
}

.ui-field__control {
    position: relative;
    display: flex;
    align-items: center;
}

.ui-field__input {
    width: 100%;
    height: 36px;
    padding-inline: var(--spacing-sm);
    background: var(--color-bg-app);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    font: var(--font-body-md);
    color: var(--color-text-primary);
}

.ui-field__input:disabled {
    color: var(--color-text-secondary);
    opacity: 0.6;
    cursor: not-allowed;
}

.ui-field--invalid .ui-field__input {
    border-color: var(--color-status-danger);
}

/* Unit inside the input's right edge, like the Figma "ticks" / "CPUs". */
.ui-field__unit {
    position: absolute;
    right: var(--spacing-sm);
    font: var(--font-body-sm);
    color: var(--color-text-secondary);
    pointer-events: none;
}

.ui-field__error {
    margin: 0;
    font: var(--font-body-sm);
    color: var(--color-status-danger-text);
}

.ui-field__hint {
    margin: 0;
    font: var(--font-body-xs);
    color: var(--color-text-secondary);
}
</style>
