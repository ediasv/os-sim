<script setup lang="ts">
import { currentError, dismissError } from '../errors';
</script>

<template>
  <div v-if="currentError" class="error-banner" role="alert">
    <span><strong>Error:</strong> {{ currentError }} (details in console)</span>
    <button type="button" @click="dismissError">Dismiss</button>
  </div>
</template>

<style scoped>
.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  border: 1px solid #c0392b;
  border-radius: 4px;
  background: #fdecea;
  color: #7a1f16;
}
</style>
