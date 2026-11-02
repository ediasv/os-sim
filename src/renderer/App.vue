<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ConfigIssue } from '../core/config';
import EmptyWorkspace from './components/EmptyWorkspace.vue';
import GanttPanel from './components/GanttPanel.vue';
import PreparedWorkspace from './components/PreparedWorkspace.vue';
import SimulationToolbar from './components/SimulationToolbar.vue';
import TaskPanel from './components/TaskPanel.vue';
import UiAlert from './components/UiAlert.vue';
import WorkspaceLayout from './components/WorkspaceLayout.vue';
import { useWorkspace } from './composables/useWorkspace';
import SystemDialog from './features/configuration/SystemDialog.vue';
import InspectionPanel from './features/inspection/InspectionPanel.vue';
import { projectInspection } from './features/inspection/inspection';
import SystemInspector from './features/system/SystemInspector.vue';
import { projectSystem } from './features/system/system';

// Composes the workspace (#36). The simulator does not exist while the user
// prepares a configuration (FE-DEC-14): useWorkspace creates it on the first
// "Avançar tick". The panels below receive projections of the published
// snapshot and never hold simulator objects.
const {
    snapshot,
    config,
    clock,
    taskCount,
    available,
    notices,
    dialog,
    handle,
    dismissNotice,
    applySystem,
    cancelDialog,
} = useWorkspace();

// Reasons the core gave for the form that is open; a form that closes or
// changes starts clean. The forms keep the values the user typed.
const formIssues = ref<readonly ConfigIssue[]>([]);
watch(dialog, () => (formIssues.value = []));

const inspection = computed(() =>
    snapshot.value === null ? null : projectInspection(snapshot.value),
);
const system = computed(() =>
    snapshot.value === null ? null : projectSystem(snapshot.value),
);
</script>

<template>
    <WorkspaceLayout>
        <template #toolbar>
            <SimulationToolbar
                :clock="clock"
                :algorithm="config.algorithm"
                :quantum="config.quantum"
                :cpu-count="config.cpuCount"
                :available="available"
                @action="handle"
            />
        </template>
        <template #sidebar>
            <TaskPanel
                :available="available"
                :task-count="taskCount"
                @action="handle"
            />
        </template>
        <div v-if="notices.length > 0" class="app__notices">
            <UiAlert
                v-for="(notice, index) in notices"
                :key="index"
                :tone="notice.tone"
                :title="notice.title"
                :message="notice.message"
                :dismissible="notice.tone === 'success'"
                @dismiss="dismissNotice(index)"
            />
        </div>
        <GanttPanel :available="available" @action="handle">
            <div
                v-if="inspection !== null && system !== null"
                class="app__details"
            >
                <SystemInspector :data="system" />
                <InspectionPanel :data="inspection" />
            </div>
            <PreparedWorkspace
                v-else-if="taskCount > 0"
                :algorithm="config.algorithm"
                :quantum="config.quantum"
                :cpu-count="config.cpuCount"
                :task-count="taskCount"
            />
            <EmptyWorkspace
                v-else
                :algorithm="config.algorithm"
                :quantum="config.quantum"
                :cpu-count="config.cpuCount"
                :available="available"
                @action="handle"
            />
        </GanttPanel>
        <SystemDialog
            v-if="dialog?.kind === 'system'"
            :initial="{
                algorithm: config.algorithm,
                quantum: config.quantum,
                cpuCount: config.cpuCount,
            }"
            :issues="formIssues"
            @apply="formIssues = applySystem($event)"
            @cancel="cancelDialog"
        />
    </WorkspaceLayout>
</template>

<style scoped>
.app__notices {
    display: grid;
    gap: var(--spacing-xs);
}

/* One problem per line (several diagnostics share one alert). */
.app__notices :deep(.ui-alert__message) {
    white-space: pre-line;
}

.app__details {
    display: grid;
    flex: 1;
    grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
    align-content: start;
    align-items: start;
    gap: var(--spacing-lg);
    min-width: 0;
    overflow: auto;
}
</style>
