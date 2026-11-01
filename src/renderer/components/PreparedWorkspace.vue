<script setup lang="ts">
import { computed } from 'vue';

// Shown inside the Gantt body when a configuration with tasks is prepared but
// the simulation has not started. The values come from the owner.
const props = defineProps<{
    algorithm: string;
    quantum: number;
    cpuCount: number;
    taskCount: number;
}>();

const summary = computed(
    () =>
        `${props.taskCount} ${props.taskCount === 1 ? 'tarefa' : 'tarefas'} · ` +
        `${props.algorithm} · quantum ${props.quantum} · ` +
        `${props.cpuCount} ${props.cpuCount === 1 ? 'CPU' : 'CPUs'}`,
);
</script>

<template>
    <div class="prepared-workspace">
        <h3 class="prepared-workspace__title">Configuração pronta</h3>
        <p class="prepared-workspace__body">
            {{ summary }}. Use “Avançar tick” para iniciar: o primeiro clique
            mostra o estado em t = 0, sem executar nenhum tick.
        </p>
    </div>
</template>

<style scoped>
.prepared-workspace {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xl);
    text-align: center;
}

.prepared-workspace__title {
    margin: 0;
    font: var(--font-heading-md);
    color: var(--color-text-primary);
}

.prepared-workspace__body {
    margin: 0;
    max-width: 480px;
    font: var(--font-body-md);
    color: var(--color-text-secondary);
}
</style>
