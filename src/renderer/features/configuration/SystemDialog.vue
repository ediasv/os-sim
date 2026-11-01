<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ConfigIssue } from '../../../core/config';
import { DEFAULT_CONFIG } from '../../../core/domain';
import UiButton from '../../components/UiButton.vue';
import UiDialog from '../../components/UiDialog.vue';
import UiField from '../../components/UiField.vue';
import UiIcon from '../../components/UiIcon.vue';
import UiAlert from '../../components/UiAlert.vue';
import type { SystemValues } from './draft';
import { toNumber } from './numberInput';

// Form for the system values (Figma "Diálogo — Configurar sistema"): it is a
// draft of its own, so closing or cancelling never touches the configuration.
// The owner applies the values and returns the core's reasons as `issues`;
// this form only shows them next to the field and keeps what was typed.
const props = defineProps<{
    initial: SystemValues;
    issues?: readonly ConfigIssue[];
}>();

const emit = defineEmits<{ apply: [values: SystemValues]; cancel: [] }>();

const algorithm = ref(props.initial.algorithm);
const quantum = ref(String(props.initial.quantum));
const cpuCount = ref(String(props.initial.cpuCount));

const ALGORITHMS = [
    { id: 'RM', label: 'RM — Rate Monotonic' },
    { id: 'EDF', label: 'EDF — Earliest Deadline First' },
] as const;

const defaults = `${DEFAULT_CONFIG.algorithm} · quantum ${DEFAULT_CONFIG.quantum} · ${DEFAULT_CONFIG.cpuCount} CPU`;

function reasons(field: ConfigIssue['field']): string | undefined {
    const found = (props.issues ?? []).filter((issue) => issue.field === field);
    return found.length === 0
        ? undefined
        : found.map((issue) => issue.message).join('\n');
}

const algorithmError = computed(() => reasons('algorithm'));

function restoreDefaults(): void {
    algorithm.value = DEFAULT_CONFIG.algorithm;
    quantum.value = String(DEFAULT_CONFIG.quantum);
    cpuCount.value = String(DEFAULT_CONFIG.cpuCount);
}

function apply(): void {
    emit('apply', {
        algorithm: algorithm.value,
        quantum: toNumber(quantum.value),
        cpuCount: toNumber(cpuCount.value),
    });
}
</script>

<template>
    <UiDialog title="Configuração do sistema" @close="emit('cancel')">
        <form class="system-dialog" @submit.prevent="apply">
            <!-- UiButton never submits; this lets Enter apply from a field. -->
            <button type="submit" hidden />
            <p class="system-dialog__intro">
                Valores padrão: {{ defaults }}. O arquivo carregado e esta tela
                sobrescrevem os padrões (A.3.2).
            </p>
            <div class="system-dialog__field">
                <label class="system-dialog__label" for="system-algorithm">
                    Algoritmo de escalonamento
                </label>
                <select
                    id="system-algorithm"
                    v-model="algorithm"
                    class="system-dialog__select"
                    :aria-invalid="algorithmError ? 'true' : undefined"
                >
                    <option
                        v-for="option in ALGORITHMS"
                        :key="option.id"
                        :value="option.id"
                    >
                        {{ option.label }}
                    </option>
                </select>
                <p v-if="algorithmError" class="system-dialog__error">
                    {{ algorithmError }}
                </p>
                <p class="system-dialog__hint">
                    Escolhido antes de iniciar (A.4.1).
                </p>
            </div>
            <div class="system-dialog__row">
                <UiField
                    v-model="quantum"
                    label="Quantum"
                    unit="ticks"
                    numeric
                    :error="reasons('quantum')"
                    hint="Inteiro ≥ 1. Fatia máxima antes de reavaliar."
                />
                <UiField
                    v-model="cpuCount"
                    label="Processadores"
                    unit="CPUs"
                    numeric
                    :error="reasons('cpuCount')"
                    hint="Inteiro ≥ 1, sem máximo (DEC-05)."
                />
            </div>
            <UiAlert
                v-for="issue in (issues ?? []).filter(
                    (i) =>
                        i.field !== 'algorithm' &&
                        i.field !== 'quantum' &&
                        i.field !== 'cpuCount',
                )"
                :key="issue.message"
                tone="danger"
                :message="issue.message"
                :dismissible="false"
            />
            <div class="system-dialog__actions">
                <UiButton variant="secondary" @click="restoreDefaults">
                    <template #icon><UiIcon name="restart" /></template>
                    Restaurar padrões
                </UiButton>
                <span class="system-dialog__spacer" />
                <UiButton variant="secondary" @click="emit('cancel')">
                    Cancelar
                </UiButton>
                <UiButton variant="primary" @click="apply">Aplicar</UiButton>
            </div>
        </form>
    </UiDialog>
</template>

<style scoped>
.system-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
}

.system-dialog__intro,
.system-dialog__hint,
.system-dialog__error {
    margin: 0;
}

.system-dialog__hint {
    font: var(--font-body-xs);
}

.system-dialog__error {
    font: var(--font-body-sm);
    color: var(--color-status-danger-text);
    white-space: pre-line;
}

.system-dialog__field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2xs);
}

.system-dialog__label {
    font: var(--font-label-sm);
}

.system-dialog__select {
    height: 36px;
    padding-inline: var(--spacing-sm);
    background: var(--color-bg-app);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    font: var(--font-body-md);
    color: var(--color-text-primary);
}

.system-dialog__row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
}

.system-dialog__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-sm);
}

.system-dialog__spacer {
    flex: 1;
}
</style>
