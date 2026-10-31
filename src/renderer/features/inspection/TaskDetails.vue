<script setup lang="ts">
import type { InspectionTask } from './inspection';

defineProps<{
    task: InspectionTask | null;
    inspectedTick: number;
}>();

const statusLabels = {
    'awaiting-activation': 'Aguardando ativação',
    active: 'Ativa',
    'awaiting-next-activation': 'Aguardando próxima ativação',
    completed: 'Terminada',
} as const;

function statusLabel(status: InspectionTask['status']): string {
    return statusLabels[status];
}
</script>

<template>
    <section class="inspection-section" aria-live="polite">
        <h2>Detalhes da tarefa</h2>
        <p v-if="task === null" class="empty-state">
            Nenhuma tarefa selecionada.
        </p>
        <dl v-else class="task-details">
            <div>
                <dt>ID</dt>
                <dd>{{ task.definition.id }}</dd>
            </div>
            <div>
                <dt>Estado</dt>
                <dd>{{ statusLabel(task.status) }}</dd>
            </div>
            <div>
                <dt>Ingresso</dt>
                <dd>{{ task.definition.arrival }}</dd>
            </div>
            <div>
                <dt>Duração</dt>
                <dd>{{ task.definition.duration }} ticks</dd>
            </div>
            <div>
                <dt>Período</dt>
                <dd>{{ task.definition.period }} ticks</dd>
            </div>
            <div>
                <dt>Prazo</dt>
                <dd>{{ task.definition.deadline }} ticks</dd>
            </div>
            <div>
                <dt>Tick inspecionado</dt>
                <dd>{{ inspectedTick }}</dd>
            </div>
        </dl>
    </section>
</template>

<style scoped>
.inspection-section {
    min-width: 0;
}

h2 {
    margin: 0 0 var(--spacing-sm);
    font: var(--font-heading-md);
}

.task-details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-sm);
    margin: 0;
}

.task-details div {
    min-width: 0;
}

dt {
    color: var(--color-text-secondary);
    font: var(--font-label-sm);
}

dd {
    margin: var(--spacing-2xs) 0 0;
    color: var(--color-text-primary);
}

.empty-state {
    margin: 0;
    color: var(--color-text-secondary);
}
</style>
