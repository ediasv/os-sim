<script setup lang="ts">
import { useSimulation } from './composables/useSimulation';

const { view, step } = useSimulation();
</script>

<template>
  <h1>os-sim</h1>
  <p>Tick: {{ view.clock }}</p>
  <button type="button" @click="step">Step</button>
</template>
