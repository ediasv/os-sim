// Exposes main's APIs to the renderer through contextBridge; the renderer has
// no Electron or Node access of its own (README import rules).
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
import { createConfigFileApi } from './configFileApi';

contextBridge.exposeInMainWorld(
    'configFile',
    createConfigFileApi((channel) => ipcRenderer.invoke(channel)),
);
