<script setup lang="ts">
import type { CpuOffInterval } from '../../../core/cpuOff';
import type { JobState } from '../../../core/domain';
import type {
    SystemCpu,
    SystemCpuCondition,
    SystemJob,
    SystemData,
} from './system';

defineProps<{ data: SystemData }>();

const conditionLabels: Readonly<Record<SystemCpuCondition, string>> = {
    running: 'Ocupada',
    off: 'Desligada',
};

const stateLabels: Readonly<Record<JobState, string>> = {
    ready: 'Pronto',
    running: 'Executando',
    suspended: 'Suspenso',
    completed: 'Concluído',
};

function jobLabel(job: SystemJob): string {
    return `Tarefa ${job.ref.taskId} · job ${job.ref.index + 1}`;
}

function offLabel(interval: CpuOffInterval): string {
    return interval.end === null
        ? `${interval.start} em aberto`
        : `${interval.start} a ${interval.end}`;
}

function offDetail(cpu: SystemCpu): string {
    const intervals =
        cpu.offIntervals.length === 0
            ? 'nunca'
            : cpu.offIntervals.map(offLabel).join('; ');
    return `Desligada: ${intervals} · Total desligado: ${cpu.totalOff}`;
}
</script>

<template>
    <section class="system-inspector">
        <header class="system-inspector__header">
            <h2>Estado do sistema</h2>
            <p class="system-inspector__snapshot">
                snapshot t = {{ data.inspectedTick }}
            </p>
        </header>

        <ul
            class="system-inspector__cpus system-inspector__scroll"
            data-testid="cpu-list"
        >
            <li
                v-for="cpu in data.cpus"
                :key="cpu.id"
                class="system-inspector__cpu"
                data-testid="cpu-row"
            >
                <div class="system-inspector__line">
                    <span class="system-inspector__name">CPU {{ cpu.id }}</span>
                    <span
                        class="system-inspector__status"
                        :class="`system-inspector__status--${cpu.condition}`"
                    >
                        <span
                            class="system-inspector__dot"
                            aria-hidden="true"
                        />
                        {{ conditionLabels[cpu.condition] }}
                    </span>
                    <span class="system-inspector__job">
                        <template v-if="cpu.job !== null">
                            <span
                                class="system-inspector__swatch"
                                :style="{
                                    backgroundColor: `#${cpu.job.color}`,
                                }"
                                aria-hidden="true"
                            />
                            {{ jobLabel(cpu.job) }}
                        </template>
                        <template v-else>—</template>
                    </span>
                    <span class="system-inspector__since">
                        desde t = {{ cpu.since }}
                    </span>
                </div>
                <p v-if="cpu.job !== null" class="system-inspector__detail">
                    Fatia: {{ cpu.sliceElapsed }} de {{ cpu.quantum }} ticks ·
                    Progresso: {{ cpu.job.executed }} de
                    {{ cpu.job.duration }} ticks
                </p>
                <p class="system-inspector__detail">{{ offDetail(cpu) }}</p>
            </li>
        </ul>

        <section class="system-inspector__section">
            <h3>FILA GLOBAL DE PRONTOS</h3>
            <ul
                class="system-inspector__list system-inspector__scroll"
                data-testid="ready-list"
            >
                <li v-if="data.ready.length === 0">
                    Vazia — nenhum job elegível esperando CPU.
                </li>
                <li
                    v-for="job in data.ready"
                    :key="`${job.ref.taskId}:${job.ref.index}`"
                    class="system-inspector__item"
                >
                    {{ jobLabel(job) }} · Progresso: {{ job.executed }} de
                    {{ job.duration }} ticks · Prazo {{ job.absoluteDeadline }}
                </li>
            </ul>
        </section>

        <section class="system-inspector__section">
            <h3>PENDENTES (DEC-02)</h3>
            <ul
                class="system-inspector__list system-inspector__scroll"
                data-testid="pending-list"
            >
                <li v-if="data.pending.length === 0">
                    Nenhum — cada tarefa tem no máximo um job incompleto.
                </li>
                <li
                    v-for="job in data.pending"
                    :key="`${job.ref.taskId}:${job.ref.index}`"
                    class="system-inspector__item"
                >
                    {{ jobLabel(job) }} · Estado: {{ stateLabels[job.state] }} ·
                    Prazo {{ job.absoluteDeadline }} · Progresso:
                    {{ job.executed }} de {{ job.duration }} ticks · Prazo
                    perdido: {{ job.deadlineMissed ? 'Sim' : 'Não' }}
                </li>
            </ul>
        </section>
    </section>
</template>

<style scoped>
.system-inspector {
    display: grid;
    gap: var(--spacing-sm);
    min-width: 0;
    padding: var(--spacing-lg);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-xl);
}

.system-inspector__header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
}

h2,
h3,
p {
    margin: 0;
}

h2 {
    flex: 1 0 0;
    min-width: 0;
    font: var(--font-heading-sm);
    color: var(--color-text-primary);
}

h3 {
    margin-bottom: var(--spacing-xs);
    font: var(--font-label-xs);
    color: var(--color-text-secondary);
}

.system-inspector__snapshot {
    font: var(--font-body-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
}

.system-inspector__cpus {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
}

.system-inspector__cpu {
    padding: var(--spacing-2xs) 0;
    border-bottom: 1px solid var(--color-border-default);
    min-width: 0;
}

.system-inspector__line {
    display: grid;
    grid-template-columns: 48px 96px minmax(0, 1fr) 80px;
    align-items: center;
    gap: var(--spacing-xs);
    min-height: 32px;
}

.system-inspector__name {
    font: var(--font-label-sm);
    color: var(--color-text-primary);
}

.system-inspector__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: var(--font-body-sm);
    color: var(--color-text-primary);
}

.system-inspector__status--off {
    color: var(--color-text-secondary);
}

.system-inspector__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--color-text-secondary);
}

.system-inspector__status--running .system-inspector__dot {
    background: var(--color-status-success);
    border-color: var(--color-status-success);
}

.system-inspector__job {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font: var(--font-body-sm);
    color: var(--color-text-primary);
    overflow-wrap: anywhere;
}

.system-inspector__swatch {
    flex: 0 0 auto;
    width: 12px;
    height: 12px;
    border-radius: var(--radius-xs);
}

.system-inspector__since {
    font: var(--font-body-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
}

.system-inspector__detail {
    padding-left: 48px;
    font: var(--font-body-xs);
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
}

.system-inspector__section {
    min-width: 0;
}

.system-inspector__list {
    display: grid;
    gap: var(--spacing-xs);
    margin: 0;
    padding: 0;
    list-style: none;
    font: var(--font-body-sm);
    color: var(--color-text-secondary);
}

.system-inspector__scroll {
    max-height: 360px;
    overflow: auto;
}

.system-inspector__item {
    padding: var(--spacing-xs);
    border-bottom: 1px solid var(--color-border-default);
    overflow-wrap: anywhere;
}
</style>
