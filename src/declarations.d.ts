/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

// Lets TS 7 `tsc` resolve SFC imports; `vue-tsc` checks the .vue files themselves.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
