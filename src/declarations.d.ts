/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';
declare module '*?raw' {
    const source: string;
    export default source;
}
