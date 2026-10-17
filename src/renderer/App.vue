<script setup lang="ts">
import { useSimulation } from './composables/useSimulation';

const { view, tick } = useSimulation();
</script>

<template>
    <h1>os-sim</h1>
    <template v-if="view">
        <p>Tick: {{ view.clock }}</p>
        <button type="button" @click="tick">Tick</button>
    </template>
    <template v-else>
        <p>Configure uma simulacao e selecione uma politica para iniciar.</p>
        <button type="button" disabled>Tick</button>
    </template>
</template>
