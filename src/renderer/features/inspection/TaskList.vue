<script setup lang="ts">
import type { InspectionTask, TaskId } from './inspection';

defineProps<{
    tasks: readonly InspectionTask[];
    selectedTaskId: TaskId | null;
}>();

const emit = defineEmits<{ select: [taskId: TaskId] }>();
</script>

<template>
    <section class="inspection-section">
        <h2>Tarefas</h2>
        <ul class="task-list" aria-label="Lista de tarefas">
            <li v-for="task in tasks" :key="task.definition.id">
                <button
                    type="button"
                    class="task-list__item"
                    :class="{
                        'task-list__item--selected':
                            task.definition.id === selectedTaskId,
                    }"
                    :aria-pressed="task.definition.id === selectedTaskId"
                    @click="emit('select', task.definition.id)"
                >
                    <span
                        class="task-list__swatch"
                        :style="{
                            backgroundColor: `#${task.definition.color}`,
                        }"
                        aria-hidden="true"
                    />
                    <span>Tarefa {{ task.definition.id }}</span>
                    <span class="task-list__status">{{ task.status }}</span>
                </button>
            </li>
        </ul>
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

.task-list {
    display: grid;
    gap: var(--spacing-2xs);
    max-height: 360px;
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
}

.task-list__item {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    align-items: center;
    gap: var(--spacing-xs);
    width: 100%;
    min-height: 40px;
    padding: var(--spacing-xs);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-primary);
    text-align: left;
    cursor: pointer;
}

.task-list__item:hover,
.task-list__item--selected {
    border-color: var(--color-border-default);
    background: var(--color-bg-raised);
}

.task-list__swatch {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-xs);
}

.task-list__status {
    color: var(--color-text-secondary);
    font: var(--font-label-sm);
}
</style>
