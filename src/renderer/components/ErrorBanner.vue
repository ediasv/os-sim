<script setup lang="ts">
import { currentError, dismissError } from '../errors';
import UiAlert from './UiAlert.vue';

// Global banner for unexpected failures only (DEC-24); correctable errors are
// shown where the user acted. Lives beside App in Root so it survives App.
</script>

<template>
    <div v-if="currentError" class="error-banner">
        <UiAlert
            tone="danger"
            title="Erro inesperado (detalhes no console)"
            :message="currentError"
            @dismiss="dismissError"
        />
    </div>
</template>

<style scoped>
/* Figma alert region above the workspace. Capped and scrolling on its own:
   #app is a 100vh column, so an unbounded stack-trace-sized message would
   squeeze the workspace to nothing and then make the page scroll. */
.error-banner {
    flex: none;
    max-height: 40vh;
    overflow-y: auto;
    padding: var(--spacing-sm) var(--spacing-lg);
}
</style>
