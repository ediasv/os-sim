<script setup lang="ts">
import type { InspectionJob, JobRef } from './inspection';

defineProps<{
    jobs: readonly InspectionJob[];
    selectedJobRef: JobRef | null;
    inspectedTick: number;
}>();

const emit = defineEmits<{ select: [job: JobRef] }>();

function sameJob(a: JobRef | null, b: JobRef): boolean {
    return a?.taskId === b.taskId && a.index === b.index;
}

function stateLabel(job: InspectionJob): string {
    if (job.availability === 'future') {
        return 'Ainda não ativado';
    }
    return {
        ready: 'Aguardando CPU',
        running: 'Executando',
        suspended: 'Suspensa',
        completed: 'Concluído',
        interrupted: 'Interrompido',
    }[job.state];
}
</script>

<template>
    <section class="inspection-section">
        <h2>Jobs</h2>
        <div class="job-table__scroll">
            <table class="job-table">
                <caption class="visually-hidden">
                    Jobs da tarefa selecionada
                </caption>
                <thead>
                    <tr>
                        <th scope="col">Job</th>
                        <th scope="col">Ativação</th>
                        <th scope="col">Prazo</th>
                        <th scope="col">Progresso</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Elegibilidade</th>
                        <th scope="col">Prazo perdido</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="job in jobs"
                        :key="`${job.ref.taskId}:${job.ref.index}`"
                        :class="{
                            'job-table__row--selected': sameJob(
                                selectedJobRef,
                                job.ref,
                            ),
                            'job-table__row--future':
                                job.availability === 'future',
                        }"
                        :aria-selected="sameJob(selectedJobRef, job.ref)"
                        tabindex="0"
                        @click="emit('select', job.ref)"
                        @keydown.enter.prevent="emit('select', job.ref)"
                        @keydown.space.prevent="emit('select', job.ref)"
                    >
                        <th scope="row">#{{ job.ref.index + 1 }}</th>
                        <td>{{ job.activation }}</td>
                        <td>{{ job.absoluteDeadline }}</td>
                        <td>
                            <span v-if="job.availability === 'current'">
                                {{ job.executed }}
                            </span>
                            <span v-else>Não disponível</span>
                        </td>
                        <td>
                            <span>{{ stateLabel(job) }}</span>
                            <span
                                v-if="job.availability === 'future'"
                                class="job-table__future-note"
                            >
                                Ainda não ativado no tick {{ inspectedTick }}.
                                Ativação registrada no tick
                                {{ job.activation }}.
                            </span>
                        </td>
                        <td>
                            <span v-if="job.availability === 'current'">
                                {{ job.eligible ? 'Elegível' : 'Não elegível' }}
                            </span>
                            <span v-else>Não disponível</span>
                        </td>
                        <td>
                            <span v-if="job.availability === 'current'">
                                {{ job.deadlineMissed ? 'Sim' : 'Não' }}
                            </span>
                            <span v-else>Não</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
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

.job-table__scroll {
    max-width: 100%;
    max-height: 360px;
    overflow: auto;
}

.job-table {
    width: 100%;
    min-width: 720px;
    border-collapse: collapse;
}

th,
td {
    padding: var(--spacing-xs);
    border-bottom: 1px solid var(--color-border-default);
    text-align: left;
    white-space: nowrap;
}

thead th {
    position: sticky;
    top: 0;
    background: var(--color-bg-surface);
    color: var(--color-text-secondary);
    font: var(--font-label-sm);
}

tbody tr {
    cursor: pointer;
}

tbody tr:hover,
.job-table__row--selected {
    background: var(--color-bg-raised);
}

.job-table__row--future {
    color: var(--color-text-secondary);
}

.job-table__future-note {
    display: block;
    max-width: 280px;
    margin-top: var(--spacing-2xs);
    white-space: normal;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
</style>
