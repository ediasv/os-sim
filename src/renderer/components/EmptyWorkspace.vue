<script setup lang="ts">
import { computed } from 'vue';
import UiButton from './UiButton.vue';
import UiIcon from './UiIcon.vue';
import {
    ACTION_META,
    NO_ACTIONS,
    type WorkspaceAction,
} from './workspaceActions';

// Shown inside the Gantt body while no task is configured. The values come
// from the owner so the copy stays true if the defaults change.
const props = withDefaults(
    defineProps<{
        algorithm: string;
        quantum: number;
        cpuCount: number;
        available?: ReadonlySet<WorkspaceAction>;
    }>(),
    { available: () => NO_ACTIONS },
);

const emit = defineEmits<{ action: [action: WorkspaceAction] }>();

// Same intents as the toolbar's, but "Sistema" is secondary here per Figma.
const actions: {
    id: WorkspaceAction;
    variant: 'secondary' | 'accent';
}[] = [
    { id: 'load-config', variant: 'accent' },
    { id: 'add-task', variant: 'secondary' },
    { id: 'configure-system', variant: 'secondary' },
];

const cpus = computed(
    () => `${props.cpuCount} ${props.cpuCount === 1 ? 'CPU' : 'CPUs'}`,
);
</script>

<template>
    <div class="empty-workspace">
        <UiIcon name="folder" :size="32" />
        <h3 class="empty-workspace__title">Nenhuma tarefa configurada</h3>
        <p class="empty-workspace__body">
            Usando os valores padrão: {{ algorithm }} · quantum {{ quantum }} ·
            {{ cpus }}. Carregue um arquivo .txt de qualquer pasta ou disco, ou
            adicione tarefas e ajuste o sistema manualmente.
        </p>
        <div class="empty-workspace__actions">
            <UiButton
                v-for="action in actions"
                :key="action.id"
                :variant="action.variant"
                :disabled="!available.has(action.id)"
                @click="emit('action', action.id)"
            >
                <template #icon
                    ><UiIcon :name="ACTION_META[action.id].icon"
                /></template>
                {{ ACTION_META[action.id].label }}
            </UiButton>
        </div>
    </div>
</template>

<style scoped>
.empty-workspace {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    color: var(--color-text-secondary);
}

.empty-workspace__title {
    margin: 0;
    font: var(--font-heading-md);
    color: var(--color-text-primary);
}

.empty-workspace__body {
    max-width: 460px;
    margin: 0;
    text-align: center;
    font: var(--font-body-md);
    color: var(--color-text-secondary);
}

.empty-workspace__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-xs);
}
</style>
