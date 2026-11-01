/// <reference types="vite/client" />

// Exposed by the preload (#33, #39); the renderer has no other file access.
interface Window {
    readonly configFile: import('../shared/configFile').ConfigFileApi;
    readonly imageFile: import('../shared/imageFile').ImageFileApi;
}
