<script setup lang="ts">
import App from './App.vue';
import ErrorBanner from './components/ErrorBanner.vue';
</script>

<template>
  <!-- Sibling, not child: the banner must survive App's setup() throwing. -->
  <ErrorBanner />
  <App />
</template>
