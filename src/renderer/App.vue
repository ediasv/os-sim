<script setup lang="ts">
import { DEFAULT_CONFIG } from '../core/domain';
import EmptyWorkspace from './components/EmptyWorkspace.vue';
import GanttPanel from './components/GanttPanel.vue';
import SimulationToolbar from './components/SimulationToolbar.vue';
import TaskPanel from './components/TaskPanel.vue';
import WorkspaceLayout from './components/WorkspaceLayout.vue';
import type { WorkspaceAction } from './components/workspaceActions';

// Preparation screen (#72): no simulator exists yet, so App does not call
// useSimulation(). Issue #36 decides when the simulator is created and
// reconciles preparation with the DEC-23 adapter contract (which starts from
// DEFAULT_CONFIG at t=0). Until then no action is available, so nothing is
// wired to `@action`.
// Typed ReadonlySet: it is never mutated (a frozen Set would still allow add()).
const none: ReadonlySet<WorkspaceAction> = new Set<WorkspaceAction>();
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
                :available="none"
            />
        </template>
        <template #sidebar>
            <TaskPanel :available="none" />
        </template>
        <GanttPanel :available="none">
            <EmptyWorkspace
                :algorithm="algorithm"
                :quantum="quantum"
                :cpu-count="cpuCount"
                :available="none"
            />
        </GanttPanel>
    </WorkspaceLayout>
</template>
