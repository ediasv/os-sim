<script setup lang="ts">
import { DEFAULT_CONFIG } from '../core/domain';
import EmptyWorkspace from './components/EmptyWorkspace.vue';
import GanttPanel from './components/GanttPanel.vue';
import SimulationToolbar from './components/SimulationToolbar.vue';
import TaskPanel from './components/TaskPanel.vue';
import WorkspaceLayout from './components/WorkspaceLayout.vue';
import { NO_ACTIONS } from './components/workspaceActions';

// Preparation screen (#72): no simulator exists yet, so App does not call
// useSimulation(). Issue #36 decides when the simulator is created and
// reconciles preparation with the DEC-23 adapter contract (which starts from
// DEFAULT_CONFIG at t=0). Until then no action is available, so nothing is
// wired to `@action`.
const { algorithm, quantum, cpuCount } = DEFAULT_CONFIG;
</script>

<template>
    <WorkspaceLayout>
        <template #toolbar>
            <SimulationToolbar
                :clock="null"
                :algorithm="algorithm"
                :quantum="quantum"
                :cpu-count="cpuCount"
                :available="NO_ACTIONS"
            />
        </template>
        <template #sidebar>
            <TaskPanel :available="NO_ACTIONS" />
        </template>
        <GanttPanel :available="NO_ACTIONS">
            <EmptyWorkspace
                :algorithm="algorithm"
                :quantum="quantum"
                :cpu-count="cpuCount"
                :available="NO_ACTIONS"
            />
        </GanttPanel>
    </WorkspaceLayout>
</template>
