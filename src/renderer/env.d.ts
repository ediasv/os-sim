/// <reference types="vite/client" />

// Exposed by the preload (#33); the renderer has no other file access.
interface Window {
    readonly configFile: import('../shared/configFile').ConfigFileApi;
}
