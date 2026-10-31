<script setup lang="ts">
import { computed } from 'vue';
import type { IconName } from './icons';
import UiButton from './UiButton.vue';
import UiIcon from './UiIcon.vue';
import type { WorkspaceAction } from './workspaceActions';

// Top bar: title, the six simulation controls and read-only parameters.
// It only reports intents; `available` is the owner's decision. It defaults
// to empty so a screen that has not wired anything yet renders every action
// disabled instead of clickable-but-dead.
const props = withDefaults(
    defineProps<{
        clock: number | null;
        algorithm: string;
        cpuCount: number;
        quantum: number;
        available?: ReadonlySet<WorkspaceAction>;
    }>(),
    { available: () => new Set<WorkspaceAction>() },
);

const emit = defineEmits<{ action: [action: WorkspaceAction] }>();

const actions: {
    id: WorkspaceAction;
    label: string;
    icon: IconName;
    variant: 'primary' | 'secondary' | 'accent';
}[] = [
    {
        id: 'load-config',
        label: 'Carregar configuração',
        icon: 'folder',
        variant: 'accent',
    },
    {
        id: 'configure-system',
        label: 'Sistema',
        icon: 'settings',
        variant: 'accent',
    },
    {
        id: 'step-back',
        label: 'Voltar tick',
        icon: 'step-back',
        variant: 'secondary',
    },
    {
        id: 'step-forward',
        label: 'Avançar tick',
        icon: 'step-forward',
        variant: 'primary',
    },
    {
        id: 'restart',
        label: 'Reiniciar',
        icon: 'restart',
        variant: 'secondary',
    },
    {
        id: 'run-all',
        label: 'Executar tudo',
        icon: 'run-all',
        variant: 'secondary',
    },
];

// The quantum is always shown: it applies to both RM and EDF (DEC-03).
// Before the first snapshot there is no tick, shown as an en dash like Figma.
const chips = computed(() => [
    {
        label: 'Tick atual',
        value: props.clock === null ? '–' : `${props.clock}`,
    },
    { label: 'Política', value: props.algorithm },
    { label: 'CPUs', value: `${props.cpuCount}` },
    { label: 'Quantum', value: `${props.quantum}` },
]);
</script>

<template>
    <header class="toolbar">
        <h1 class="toolbar__title">os-sim</h1>
        <div class="toolbar__actions">
            <UiButton
                v-for="action in actions"
                :key="action.id"
                :variant="action.variant"
                :disabled="!available.has(action.id)"
                @click="emit('action', action.id)"
            >
                <template #icon><UiIcon :name="action.icon" /></template>
                {{ action.label }}
            </UiButton>
        </div>
        <dl class="toolbar__chips">
            <div v-for="chip in chips" :key="chip.label" class="toolbar__chip">
                <dt class="toolbar__chip-label">{{ chip.label }}</dt>
                <dd class="toolbar__chip-value">{{ chip.value }}</dd>
            </div>
        </dl>
    </header>
</template>

<style scoped>
/* Figma "Toolbar": 64px is a minimum so the wrapped second row can grow it. */
.toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-sm);
    min-height: 64px;
    padding-block: var(--spacing-sm);
    padding-inline: var(--spacing-xl);
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border-default);
}

.toolbar__title {
    margin: 0;
    font: var(--font-heading-lg);
    color: var(--color-text-primary);
}

.toolbar__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
}

.toolbar__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    margin: 0 0 0 auto;
}

.toolbar__chip {
    padding: 5px var(--spacing-md);
    background: var(--color-bg-raised);
    border-radius: var(--radius-lg);
}

.toolbar__chip-label {
    font: var(--font-label-xs);
    color: var(--color-text-secondary);
}

.toolbar__chip-value {
    margin: 0;
    font: var(--font-heading-md);
    color: var(--color-text-primary);
}
</style>
