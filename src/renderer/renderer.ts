/**
 * Renderer entry, loaded by Vite in the "renderer" context. Node.js integration
 * is disabled here; expose anything privileged through the preload script.
 *
 * https://electronjs.org/docs/tutorial/process-model
 */

import { createApp } from 'vue';
import Root from './Root.vue';
import { installErrorHandlers } from './errors';
import './index.css';

const app = createApp(Root);
installErrorHandlers(app, window);
app.mount('#app');
