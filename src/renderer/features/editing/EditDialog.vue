<script setup lang="ts">
import { computed, reactive } from 'vue';
import UiAlert from '../../components/UiAlert.vue';
import UiButton from '../../components/UiButton.vue';
import UiDialog from '../../components/UiDialog.vue';
import UiField from '../../components/UiField.vue';
import type { FormField } from './forms';

// The one form shell of every edit of a running simulation (Figma "Diálogo —
// Editar tarefa" and "Configurar sistema"), built on the shared `UiDialog` and
// `UiField`. It draws the fields it is given, keeps the draft, and reports
// `submit` with the typed values. It decides nothing about them. The owner
// builds the edit, sends it, and passes back the refusals as `errors` (per
// field) and `message` (whole form); a refusal never closes the dialog, so
// what the user typed stays (FE-11). The owner mounts it with `v-if`, so every
// opening starts from `initial`.
const props = withDefaults(
    defineProps<{
        title: string;
        fields: readonly FormField[];
        initial: Readonly<Record<string, string>>;
        errors?: Readonly<Record<string, string>>;
        message?: string | null;
        /** Banner on top, such as the ticks an accepted edit discards. */
        notice?: { title: string; message: string } | null;
        dangerLabel?: string;
    }>(),
    { errors: () => ({}), message: null, notice: null, dangerLabel: undefined },
);

const emit = defineEmits<{
    submit: [values: Record<string, string>];
    close: [];
    danger: [];
}>();

const values = reactive<Record<string, string>>({ ...props.initial });

const dirty = computed(() =>
    Object.keys(props.initial).some(
        (key) => values[key] !== props.initial[key],
    ),
);

/** A locked field says why next to its hint, so the reason is never hidden. */
function hintOf(field: FormField): string | undefined {
    return field.disabledReason ?? field.hint;
}

function submit(): void {
    if (dirty.value) emit('submit', { ...values });
}
</script>

<template>
    <UiDialog wide :title="title" @close="emit('close')">
        <UiAlert
            v-if="notice"
            tone="info"
            :title="notice.title"
            :message="notice.message"
            :dismissible="false"
        />
        <form class="edit-dialog__form" @submit.prevent="submit">
            <!-- UiButton never submits; this lets Enter apply from a field. -->
            <button type="submit" hidden />
            <template v-for="field in fields" :key="field.key">
                <div
                    v-if="field.options"
                    class="edit-dialog__select-field"
                    :class="{ 'edit-dialog__field--wide': field.wide }"
                >
                    <label
                        class="edit-dialog__label"
                        :for="`edit-${field.key}`"
                    >
                        {{ field.label }}
                    </label>
                    <select
                        :id="`edit-${field.key}`"
                        v-model="values[field.key]"
                        class="edit-dialog__select"
                        :disabled="field.disabled"
                        :aria-invalid="errors[field.key] ? 'true' : undefined"
                    >
                        <option
                            v-for="option in field.options"
                            :key="option.value"
                            :value="option.value"
                        >
                            {{ option.label }}
                        </option>
                    </select>
                    <p v-if="errors[field.key]" class="edit-dialog__error">
                        {{ errors[field.key] }}
                    </p>
                    <p v-if="hintOf(field)" class="edit-dialog__hint">
                        {{ hintOf(field) }}
                    </p>
                </div>
                <UiField
                    v-else-if="field.fixedValue !== undefined"
                    :model-value="field.fixedValue"
                    :class="{ 'edit-dialog__field--wide': field.wide }"
                    :label="field.label"
                    :unit="field.unit"
                    :hint="hintOf(field)"
                    disabled
                />
                <UiField
                    v-else
                    v-model="values[field.key]"
                    :class="{ 'edit-dialog__field--wide': field.wide }"
                    :label="field.label"
                    :unit="field.unit"
                    :hint="hintOf(field)"
                    :error="errors[field.key]"
                    :disabled="field.disabled"
                />
            </template>
        </form>
        <UiAlert
            v-if="message"
            class="edit-dialog__message"
            tone="danger"
            :message="message"
            :dismissible="false"
        />
        <template #footer>
            <UiButton
                v-if="dangerLabel"
                class="edit-dialog__danger"
                variant="danger"
                @click="emit('danger')"
            >
                {{ dangerLabel }}
            </UiButton>
            <UiButton variant="secondary" @click="emit('close')">
                Cancelar
            </UiButton>
            <UiButton variant="primary" :disabled="!dirty" @click="submit">
                Aplicar
            </UiButton>
        </template>
    </UiDialog>
</template>

<style scoped>
.edit-dialog__form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-md);
}

.edit-dialog__field--wide {
    grid-column: 1 / -1;
}

.edit-dialog__select-field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2xs);
    min-width: 0;
}

.edit-dialog__label {
    font: var(--font-label-sm);
    color: var(--color-text-secondary);
}

.edit-dialog__select {
    height: 36px;
    padding-inline: var(--spacing-sm);
    background: var(--color-bg-app);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    font: var(--font-body-md);
    color: var(--color-text-primary);
}

.edit-dialog__select[aria-invalid='true'] {
    border-color: var(--color-status-danger);
}

.edit-dialog__hint,
.edit-dialog__error {
    margin: 0;
}

.edit-dialog__hint {
    font: var(--font-body-xs);
}

.edit-dialog__error {
    font: var(--font-body-sm);
    color: var(--color-status-danger-text);
    white-space: pre-line;
}

.edit-dialog__message {
    white-space: pre-line;
}

.edit-dialog__danger {
    margin-right: auto;
}
</style>
