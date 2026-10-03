/// <reference types="vite/client" />
import type { WmsBridge } from "../shared/ipc";

declare global {
  interface Window {
    /** Injected by the Electron preload. Undefined when the renderer runs in a plain browser. */
    wms?: WmsBridge;
  }
}

export {};
