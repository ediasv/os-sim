<script setup lang="ts">
import { ref } from 'vue';

const count = ref<number>(0);
</script>

<template>
  <h1>os-sim</h1>
  <p>Vue is running in the Electron renderer.</p>
  <button type="button" @click="count++">Clicked {{ count }} times</button>
</template>
