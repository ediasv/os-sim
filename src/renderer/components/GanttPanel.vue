<script setup lang="ts">
import UiButton from './UiButton.vue';
import UiIcon from './UiIcon.vue';
import UiIconButton from './UiIconButton.vue';
import {
    ACTION_META,
    NO_ACTIONS,
    type WorkspaceAction,
} from './workspaceActions';

// Main-area panel: header with zoom and export, body in the default slot
// (#38 puts the chart there). The zoom state lives with the owner (`useWorkspace`);
// the panel only shows the readout it is given. Outer padding belongs to
// WorkspaceLayout's main region.
withDefaults(
    defineProps<{
        available?: ReadonlySet<WorkspaceAction>;
        zoomLabel?: string;
    }>(),
    { available: () => NO_ACTIONS, zoomLabel: '100%' },
);

const emit = defineEmits<{ action: [action: WorkspaceAction] }>();
</script>

<template>
    <section class="gantt-panel">
        <header class="gantt-panel__header">
            <h2 class="gantt-panel__title">Diagrama de Gantt</h2>
            <div class="gantt-panel__zoom">
                <UiIconButton
                    :label="ACTION_META['zoom-out'].label"
                    :disabled="!available.has('zoom-out')"
                    @click="emit('action', 'zoom-out')"
                >
                    <UiIcon :name="ACTION_META['zoom-out'].icon" />
                </UiIconButton>
                <span class="gantt-panel__readout">{{ zoomLabel }}</span>
                <UiIconButton
                    :label="ACTION_META['zoom-in'].label"
                    :disabled="!available.has('zoom-in')"
                    @click="emit('action', 'zoom-in')"
                >
                    <UiIcon :name="ACTION_META['zoom-in'].icon" />
                </UiIconButton>
            </div>
            <UiButton
                variant="secondary"
                :disabled="!available.has('export-svg')"
                @click="emit('action', 'export-svg')"
            >
                <template #icon
                    ><UiIcon :name="ACTION_META['export-svg'].icon"
                /></template>
                {{ ACTION_META['export-svg'].label }}
            </UiButton>
        </header>
        <div class="gantt-panel__body"><slot /></div>
    </section>
</template>

<style scoped>
.gantt-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--spacing-sm);
    min-height: 0;
}

.gantt-panel__header {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    min-height: 36px;
}

.gantt-panel__title {
    margin: 0 auto 0 0;
    font: var(--font-heading-md);
    color: var(--color-text-primary);
}

.gantt-panel__zoom {
    display: flex;
    align-items: center;
    gap: var(--spacing-2xs);
}

.gantt-panel__readout {
    width: 44px;
    text-align: center;
    font: var(--font-label-sm);
    color: var(--color-text-secondary);
}

.gantt-panel__body {
    display: flex;
    flex: 1;
    min-height: 0;
}
</style>
