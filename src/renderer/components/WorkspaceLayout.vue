<script setup lang="ts">
// Esqueleto da area de trabalho: barra de simulacao, painel de tarefas e
// area principal. Apenas posiciona os slots; nao conhece o conteudo.
</script>

<template>
    <div class="workspace">
        <div class="workspace__toolbar"><slot name="toolbar" /></div>
        <aside class="workspace__sidebar" aria-label="Tarefas">
            <slot name="sidebar" />
        </aside>
        <main class="workspace__main"><slot /></main>
    </div>
</template>

<style scoped>
.workspace {
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: 320px minmax(0, 1fr);
    flex: 1;
    min-height: 0;
}

/* A barra ocupa as duas colunas; o painel e a area principal ficam abaixo. */
.workspace__toolbar {
    grid-column: 1 / -1;
}

.workspace__sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-lg);
    background: var(--color-bg-surface);
    border-right: 1px solid var(--color-border-default);
    overflow: auto;
}

/* Sem min-width: 0 um Gantt largo esticaria a coluna e a janela. */
.workspace__main {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-lg);
    background: var(--color-bg-app);
    min-width: 0;
    overflow: auto;
}
</style>
