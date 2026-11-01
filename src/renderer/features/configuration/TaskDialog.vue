<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ConfigField, ConfigIssue } from '../../../core/config';
import UiAlert from '../../components/UiAlert.vue';
import UiButton from '../../components/UiButton.vue';
import UiDialog from '../../components/UiDialog.vue';
import UiField from '../../components/UiField.vue';
import type { TaskValues } from './draft';
import { toNumber } from './numberInput';

// Form of one task (Figma "Diálogo — Editar tarefa"), shared by adding now
// and, when #37 edits during a simulation, by that flow: it knows only the
// fields and the reasons it is given. It is a draft of its own; the owner
// applies it and returns the core's reasons as `issues`. `taskIndex` is where
// the task sits (or will sit) in the configuration, so issues about it show
// at its fields while those about other tasks show as plain messages.
const props = defineProps<{
    initial: TaskValues;
    /** Editing an existing task (shows "Remover tarefa") or adding a new one. */
    editing: boolean;
    taskIndex: number;
    issues?: readonly ConfigIssue[];
}>();

const emit = defineEmits<{
    apply: [values: TaskValues];
    cancel: [];
    remove: [];
}>();

const color = ref(props.initial.color);
const arrival = ref(String(props.initial.arrival));
const duration = ref(String(props.initial.duration));
const period = ref(String(props.initial.period));
const deadline = ref(String(props.initial.deadline));

const FIELDS: readonly ConfigField[] = [
    'color',
    'arrival',
    'duration',
    'period',
    'deadline',
];

function ownIssue(issue: ConfigIssue): boolean {
    return issue.taskIndex === props.taskIndex && FIELDS.includes(issue.field);
}

function reasons(field: ConfigField): string | undefined {
    const found = (props.issues ?? []).filter(
        (issue) => ownIssue(issue) && issue.field === field,
    );
    return found.length === 0
        ? undefined
        : found.map((issue) => issue.message).join('\n');
}

/** Reasons not shown at a field: other tasks, or the system line. */
const otherIssues = computed(() =>
    (props.issues ?? []).filter((issue) => !ownIssue(issue)),
);

const swatch = computed(() =>
    /^[0-9a-f]{6}$/i.test(color.value.trim()) ? `#${color.value.trim()}` : null,
);

function apply(): void {
    emit('apply', {
        id: props.initial.id,
        color: color.value.trim(),
        arrival: toNumber(arrival.value),
        duration: toNumber(duration.value),
        period: toNumber(period.value),
        deadline: toNumber(deadline.value),
    });
}
</script>

<template>
    <UiDialog
        wide
        :title="editing ? `Editar Tarefa ${initial.id}` : 'Adicionar tarefa'"
        @close="emit('cancel')"
    >
        <template #title>
            <span
                v-if="swatch"
                class="task-dialog__swatch"
                :style="{ backgroundColor: swatch }"
                aria-hidden="true"
            />
            {{ editing ? `Editar Tarefa ${initial.id}` : 'Adicionar tarefa' }}
        </template>
        <form class="task-dialog" @submit.prevent="apply">
            <!-- UiButton never submits; this lets Enter apply from a field. -->
            <button type="submit" hidden />
            <p class="task-dialog__section">Características da tarefa</p>
            <div class="task-dialog__grid">
                <UiField
                    :model-value="String(initial.id)"
                    label="ID"
                    disabled
                    hint="O ID é gerado e não muda depois de criado."
                />
                <UiField
                    v-model="color"
                    label="Cor"
                    :error="reasons('color')"
                    hint="RRGGBB, diferente das outras tarefas."
                />
                <UiField
                    v-model="arrival"
                    label="Ingresso"
                    unit="ticks"
                    numeric
                    :error="reasons('arrival')"
                    hint="Instante da primeira ativação (≥ 0)."
                />
                <UiField
                    v-model="duration"
                    label="Duração"
                    unit="ticks"
                    numeric
                    :error="reasons('duration')"
                    hint="Ticks de CPU por job (≥ 1)."
                />
                <UiField
                    v-model="period"
                    label="Período"
                    unit="ticks"
                    numeric
                    :error="reasons('period')"
                    hint="Inteiro ≥ 1; tarefa nova parte de 15 (DEC-29). Periódica: até 10 jobs."
                />
                <UiField
                    v-model="deadline"
                    label="Prazo relativo"
                    unit="ticks"
                    numeric
                    :error="reasons('deadline')"
                    hint="Inteiro ≥ 1, contado desde cada ativação."
                />
            </div>
            <UiAlert
                v-for="issue in otherIssues"
                :key="issue.message"
                tone="danger"
                :message="issue.message"
                :dismissible="false"
            />
            <div class="task-dialog__actions">
                <UiButton
                    v-if="editing"
                    variant="danger"
                    @click="emit('remove')"
                >
                    Remover tarefa
                </UiButton>
                <span class="task-dialog__spacer" />
                <UiButton variant="secondary" @click="emit('cancel')">
                    Cancelar
                </UiButton>
                <UiButton variant="primary" @click="apply">Aplicar</UiButton>
            </div>
        </form>
    </UiDialog>
</template>

<style scoped>
.task-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
}

.task-dialog__section {
    margin: 0;
    font: var(--font-label-xs);
    text-transform: uppercase;
    color: var(--color-text-secondary);
}

.task-dialog__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
}

.task-dialog__swatch {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-xs);
}

.task-dialog__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-sm);
}

.task-dialog__spacer {
    flex: 1;
}
</style>
