<script setup lang="ts">
import UiButton from '../../components/UiButton.vue';
import {
    describeTaskChoice,
    inspectionTaskStatusLabels,
    type InspectionTask,
} from './inspection';

defineProps<{
    task: InspectionTask | null;
    inspectedTick: number;
}>();

// Only reports the intent; the owner opens the form and sends the edit (#37).
const emit = defineEmits<{ edit: [] }>();

function statusLabel(status: InspectionTask['status']): string {
    return inspectionTaskStatusLabels[status];
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
                <dt>Estado escolhido</dt>
                <dd>{{ describeTaskChoice(task) }}</dd>
            </div>
            <div>
                <dt>Próxima ativação</dt>
                <dd>
                    {{
                        task.nextActivation === null
                            ? 'Nenhuma restante'
                            : `tick ${task.nextActivation}`
                    }}
                </dd>
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
        <UiButton
            v-if="task !== null"
            class="task-details__edit"
            variant="secondary"
            @click="emit('edit')"
        >
            Editar tarefa
        </UiButton>
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

.task-details__edit {
    margin-top: var(--spacing-sm);
}

.empty-state {
    margin: 0;
    color: var(--color-text-secondary);
}
</style>
