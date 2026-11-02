<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import JobTable from './JobTable.vue';
import TaskDetails from './TaskDetails.vue';
import TaskList from './TaskList.vue';
import type { InspectionData, JobRef, TaskId } from './inspection';

const props = defineProps<{ data: InspectionData }>();

// The panel owns which task is selected, so it names the task to edit.
const emit = defineEmits<{ 'edit-task': [taskId: TaskId] }>();

const selectedTaskId = ref<TaskId | null>(
    props.data.tasks[0]?.definition.id ?? null,
);
const selectedJobRef = ref<JobRef | null>(null);

function hasJob(data: InspectionData, refToFind: JobRef): boolean {
    const task = data.tasks.find(
        (candidate) => candidate.definition.id === refToFind.taskId,
    );
    return (
        (task?.jobs.some(
            (job) =>
                job.ref.taskId === refToFind.taskId &&
                job.ref.index === refToFind.index,
        ) ??
            false) ||
        data.futureJobs.some(
            (job) =>
                job.ref.taskId === refToFind.taskId &&
                job.ref.index === refToFind.index,
        )
    );
}

watch(
    () => props.data,
    (data) => {
        if (
            selectedTaskId.value !== null &&
            data.tasks.some(
                (task) => task.definition.id === selectedTaskId.value,
            )
        ) {
            if (
                selectedJobRef.value !== null &&
                !hasJob(data, selectedJobRef.value)
            ) {
                selectedJobRef.value = null;
            }
            return;
        }

        selectedTaskId.value = data.tasks[0]?.definition.id ?? null;
        selectedJobRef.value = null;
    },
);

const selectedTask = computed(
    () =>
        props.data.tasks.find(
            (task) => task.definition.id === selectedTaskId.value,
        ) ?? null,
);

const selectedJobs = computed(() => {
    if (selectedTask.value === null) {
        return [];
    }
    return [
        ...selectedTask.value.jobs,
        ...props.data.futureJobs.filter(
            (job) => job.ref.taskId === selectedTask.value?.definition.id,
        ),
    ];
});

function selectTask(taskId: TaskId): void {
    selectedTaskId.value = taskId;
    selectedJobRef.value = null;
}

function selectJob(job: JobRef): void {
    selectedTaskId.value = job.taskId;
    selectedJobRef.value = { taskId: job.taskId, index: job.index };
}
</script>

<template>
    <section class="inspection-panel">
        <p class="inspection-panel__tick">
            Tick inspecionado: <strong>{{ data.inspectedTick }}</strong>
        </p>
        <div class="inspection-panel__grid">
            <TaskList
                :tasks="data.tasks"
                :selected-task-id="selectedTaskId"
                @select="selectTask"
            />
            <TaskDetails
                :task="selectedTask"
                :inspected-tick="data.inspectedTick"
                @edit="
                    selectedTask &&
                    emit('edit-task', selectedTask.definition.id)
                "
            />
        </div>
        <JobTable
            :jobs="selectedJobs"
            :selected-job-ref="selectedJobRef"
            :inspected-tick="data.inspectedTick"
            @select="selectJob"
        />
    </section>
</template>

<style scoped>
.inspection-panel {
    display: grid;
    gap: var(--spacing-lg);
    min-width: 0;
    padding: var(--spacing-lg);
    background: var(--color-bg-surface);
}

.inspection-panel__tick {
    margin: 0;
    color: var(--color-text-secondary);
}

.inspection-panel__tick strong {
    color: var(--color-text-primary);
}

.inspection-panel__grid {
    display: grid;
    grid-template-columns: minmax(180px, 0.8fr) minmax(280px, 1.2fr);
    gap: var(--spacing-xl);
}

@media (max-width: 720px) {
    .inspection-panel__grid {
        grid-template-columns: 1fr;
    }
}
</style>
