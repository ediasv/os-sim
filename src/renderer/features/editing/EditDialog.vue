<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import UiAlert from '../../components/UiAlert.vue';
import UiButton from '../../components/UiButton.vue';
import UiDialog from '../../components/UiDialog.vue';
import UiField from '../../components/UiField.vue';
import type { FormField } from './forms';

// The one form shell of every edit (Figma "Diálogo — Editar tarefa" and
// "Configurar sistema"): it draws the fields it is given, keeps the draft, and
// reports `submit` with the typed values. It decides nothing about them. The
// owner builds the edit, sends it, and passes back the refusals as `errors`
// (per field) and `message` (whole form); a refusal never closes the dialog,
// so what the user typed stays (FE-11).
const props = withDefaults(
    defineProps<{
        open: boolean;
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

// Opening starts a new draft; closing by any path discards the old one.
watch(
    () => props.open,
    (open) => {
        if (!open) return;
        for (const key of Object.keys(values)) delete values[key];
        Object.assign(values, props.initial);
    },
);

const dirty = computed(() =>
    Object.keys(props.initial).some(
        (key) => values[key] !== props.initial[key],
    ),
);

function submit(): void {
    if (dirty.value) emit('submit', { ...values });
}
</script>

<template>
    <UiDialog :open="open" :title="title" @close="emit('close')">
        <template v-if="$slots['title-icon']" #title-icon>
            <slot name="title-icon" />
        </template>
        <UiAlert
            v-if="notice"
            tone="info"
            :title="notice.title"
            :message="notice.message"
            :dismissible="false"
        />
        <form class="edit-dialog__form" @submit.prevent="submit">
            <UiField
                v-for="field in fields"
                :key="field.key"
                v-slot="{ id, describedBy, invalid }"
                class="edit-dialog__field"
                :class="{ 'edit-dialog__field--wide': field.wide }"
                :label="field.label"
                :hint="field.hint"
                :error="errors[field.key]"
                :disabled-reason="field.disabledReason"
            >
                <select
                    v-if="field.options"
                    :id="id"
                    v-model="values[field.key]"
                    class="edit-dialog__control"
                    :disabled="field.disabled"
                    :aria-describedby="describedBy"
                    :aria-invalid="invalid"
                >
                    <option
                        v-for="option in field.options"
                        :key="option.value"
                        :value="option.value"
                    >
                        {{ option.label }}
                    </option>
                </select>
                <span v-else class="edit-dialog__input">
                    <input
                        v-if="field.fixedValue !== undefined"
                        :id="id"
                        type="text"
                        class="edit-dialog__control"
                        :value="field.fixedValue"
                        disabled
                        :aria-describedby="describedBy"
                    />
                    <input
                        v-else
                        :id="id"
                        v-model="values[field.key]"
                        type="text"
                        class="edit-dialog__control"
                        :disabled="field.disabled"
                        :aria-describedby="describedBy"
                        :aria-invalid="invalid"
                    />
                    <span v-if="field.unit" class="edit-dialog__unit">
                        {{ field.unit }}
                    </span>
                </span>
            </UiField>
        </form>
        <UiAlert
            v-if="message"
            class="edit-dialog__message"
            tone="danger"
            :message="message"
            :dismissible="false"
        />
        <template #actions>
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

.edit-dialog__input {
    position: relative;
    display: block;
}

.edit-dialog__control {
    box-sizing: border-box;
    width: 100%;
    height: 36px;
    padding-inline: var(--spacing-sm);
    color: var(--color-text-primary);
    font: var(--font-body-md);
    background: var(--color-bg-app);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
}

.edit-dialog__control[aria-invalid='true'] {
    border-color: var(--color-status-danger);
}

.edit-dialog__control:disabled {
    color: var(--color-text-secondary);
}

.edit-dialog__unit {
    position: absolute;
    top: 50%;
    right: var(--spacing-sm);
    color: var(--color-text-secondary);
    font: var(--font-body-sm);
    transform: translateY(-50%);
    pointer-events: none;
}

.edit-dialog__message {
    white-space: pre-line;
}

.edit-dialog__danger {
    margin-right: auto;
}
</style>
