<script setup lang="ts">
import UiButton from './UiButton.vue';
import UiIcon from './UiIcon.vue';
import type { WorkspaceAction } from './workspaceActions';

// Side panel for the task list. Only the empty state exists for now; #71
// puts the list between the header and the add button. Outer padding belongs
// to WorkspaceLayout's sidebar region.
withDefaults(defineProps<{ available?: ReadonlySet<WorkspaceAction> }>(), {
    available: () => new Set<WorkspaceAction>(),
});

const emit = defineEmits<{ action: [action: WorkspaceAction] }>();
</script>

<template>
    <section class="task-panel">
        <header class="task-panel__header">
            <h2 class="task-panel__title">Tarefas</h2>
        </header>
        <p class="task-panel__text">
            Nenhuma tarefa. Carregue um arquivo de configuração ou adicione
            tarefas manualmente.
        </p>
        <UiButton
            class="task-panel__add"
            variant="secondary"
            :disabled="!available.has('add-task')"
            @click="emit('action', 'add-task')"
        >
            <template #icon><UiIcon name="plus" /></template>
            Adicionar tarefa
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

.task-panel__add {
    width: 100%;
}
</style>
