<script setup lang="ts">
import type { TaskId } from '../../core/domain';
import UiButton from './UiButton.vue';
import UiIcon from './UiIcon.vue';
import {
    ACTION_META,
    NO_ACTIONS,
    type WorkspaceAction,
} from './workspaceActions';

/** What a card shows of a task being prepared (Figma "Task card"). */
export interface PreparedTask {
    readonly id: TaskId;
    readonly color: string;
    readonly period: number;
    readonly duration: number;
    readonly deadline: number;
}

// Side panel for the tasks. While preparing it lists them as cards, one
// selected, with the edit and add buttons (Figma "Tela — Pronta para
// iniciar"); once the simulation runs, the inspection panel lists them and
// only the count remains here. Selecting reports the id and decides nothing.
// Outer padding belongs to WorkspaceLayout's sidebar region.
withDefaults(
    defineProps<{
        available?: ReadonlySet<WorkspaceAction>;
        taskCount?: number;
        tasks?: readonly PreparedTask[];
        selectedTaskId?: TaskId | null;
    }>(),
    {
        available: () => NO_ACTIONS,
        taskCount: 0,
        tasks: () => [],
        selectedTaskId: null,
    },
);

const emit = defineEmits<{
    action: [action: WorkspaceAction];
    select: [taskId: TaskId];
}>();
</script>

<template>
    <section class="task-panel">
        <header class="task-panel__header">
            <h2 class="task-panel__title">Tarefas</h2>
        </header>
        <p v-if="taskCount > 0" class="task-panel__text">
            {{ taskCount }}
            {{
                taskCount === 1 ? 'tarefa configurada' : 'tarefas configuradas'
            }}.
        </p>
        <p v-else class="task-panel__text">
            Nenhuma tarefa. Carregue um arquivo de configuração ou adicione
            tarefas manualmente.
        </p>
        <ul
            v-if="tasks.length > 0"
            class="task-panel__cards"
            aria-label="Tarefas"
        >
            <li v-for="task in tasks" :key="task.id">
                <button
                    type="button"
                    class="task-panel__card"
                    :aria-pressed="task.id === selectedTaskId"
                    @click="emit('select', task.id)"
                >
                    <span class="task-panel__card-title">
                        <span
                            class="task-panel__swatch"
                            :style="{ backgroundColor: `#${task.color}` }"
                            aria-hidden="true"
                        />Tarefa {{ task.id }}</span
                    >
                    <span class="task-panel__card-meta"
                        >período {{ task.period }} · duração
                        {{ task.duration }} · prazo {{ task.deadline }}</span
                    >
                </button>
            </li>
        </ul>
        <UiButton
            v-if="tasks.length > 0"
            class="task-panel__add"
            variant="accent"
            :disabled="!available.has('edit-task')"
            @click="emit('action', 'edit-task')"
        >
            <template #icon
                ><UiIcon :name="ACTION_META['edit-task'].icon"
            /></template>
            {{ ACTION_META['edit-task'].label }}
        </UiButton>
        <UiButton
            class="task-panel__add"
            variant="secondary"
            :disabled="!available.has('add-task')"
            @click="emit('action', 'add-task')"
        >
            <template #icon
                ><UiIcon :name="ACTION_META['add-task'].icon"
            /></template>
            {{ ACTION_META['add-task'].label }}
        </UiButton>
    </section>
</template>

<style scoped>
.task-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
}

.task-panel__header {
    display: flex;
    align-items: center;
    height: 36px;
}

.task-panel__title {
    margin: 0;
    font: var(--font-heading-md);
    color: var(--color-text-primary);
}

.task-panel__text {
    margin: 0;
    font: var(--font-body-sm);
    color: var(--color-text-secondary);
}

.task-panel__cards {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
}

.task-panel__card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2xs);
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-bg-raised);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    color: var(--color-text-primary);
    text-align: left;
    cursor: pointer;
}

.task-panel__card[aria-pressed='true'] {
    border-color: var(--color-accent-default);
}

.task-panel__card-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font: var(--font-heading-sm);
}

.task-panel__swatch {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-xs);
}

.task-panel__card-meta {
    font: var(--font-body-xs);
    color: var(--color-text-secondary);
}

.task-panel__add {
    width: 100%;
}
</style>
