<script setup lang="ts">
import { useSimulation } from './composables/useSimulation';

const { view,  tick } = useSimulation();
</script>

<template>
  <h1>os-sim</h1>
  <p>Tick: {{ view.clock }}</p>
  <button type="button" @click="tick">Tick</button>
</template>
