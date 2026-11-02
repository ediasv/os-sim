<script setup lang="ts">
import { computed, useId } from 'vue';

// Label, control, hint and error of one form field (Figma "Campo"). The
// control comes through the slot and receives the ids it must carry, so the
// label, the hint and the error stay tied to it for assistive technology.
// `disabledReason` explains a blocked field as visible text and as `title`
// (no tooltip component exists, so the text is always readable).
const props = defineProps<{
    label: string;
    hint?: string;
    error?: string;
    disabledReason?: string;
}>();

const id = useId();
const hintId = `${id}-hint`;
const errorId = `${id}-error`;
const reasonId = `${id}-reason`;

const describedBy = computed(
    () =>
        [
            props.hint ? hintId : null,
            props.disabledReason ? reasonId : null,
            props.error ? errorId : null,
        ]
            .filter((value) => value !== null)
            .join(' ') || undefined,
);
</script>

<template>
    <div class="ui-field" :title="disabledReason">
        <label :for="id" class="ui-field__label">{{ label }}</label>
        <slot :id="id" :described-by="describedBy" :invalid="!!error" />
        <p v-if="hint" :id="hintId" class="ui-field__hint">{{ hint }}</p>
        <p v-if="disabledReason" :id="reasonId" class="ui-field__hint">
            {{ disabledReason }}
        </p>
        <p v-if="error" :id="errorId" class="ui-field__error" role="alert">
            {{ error }}
        </p>
    </div>
</template>

<style scoped>
.ui-field {
    display: grid;
    gap: var(--spacing-2xs);
    min-width: 0;
}

.ui-field__label {
    color: var(--color-text-secondary);
    font: var(--font-label-sm);
}

.ui-field__hint,
.ui-field__error {
    margin: 0;
    font: var(--font-body-xs);
    white-space: pre-line;
}

.ui-field__hint {
    color: var(--color-text-secondary);
}

.ui-field__error {
    color: var(--color-status-danger-text);
}
</style>
