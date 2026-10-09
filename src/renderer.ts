/**
 * Renderer entry, loaded by Vite in the "renderer" context. Node.js integration
 * is disabled here; expose anything privileged through the preload script.
 *
 * https://electronjs.org/docs/tutorial/process-model
 */

import { createApp } from 'vue';
import App from './App.vue';
import './index.css';

createApp(App).mount('#app');
