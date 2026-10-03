import { contextBridge, ipcRenderer } from "electron";
import { IPC, type WmsBridge } from "../shared/ipc";

const bridge: WmsBridge = {
  host: () => ipcRenderer.invoke(IPC.host),
  printers: () => ipcRenderer.invoke(IPC.printers),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  setFullscreen: (on) => ipcRenderer.invoke(IPC.setFullscreen, on),
  isFullscreen: () => ipcRenderer.invoke(IPC.isFullscreen),
  storeGet: (key) => ipcRenderer.invoke(IPC.storeGet, key),
  storeSet: (key, value) => ipcRenderer.invoke(IPC.storeSet, key, value),
  quit: () => ipcRenderer.invoke(IPC.quit),
};

contextBridge.exposeInMainWorld("wms", bridge);
