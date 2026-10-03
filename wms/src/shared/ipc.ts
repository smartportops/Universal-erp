/**
 * Contract between the Electron main process and the renderer.
 * Everything the UI may ask the host for goes through `window.wms`.
 */
export type PrinterInfo = {
  name: string;
  displayName: string;
  isDefault: boolean;
};

export type HostInfo = {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  hostname: string;
};

export type WmsBridge = {
  host(): Promise<HostInfo>;
  printers(): Promise<PrinterInfo[]>;
  openExternal(url: string): Promise<void>;
  setFullscreen(on: boolean): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  /** Persistent key/value store living in the OS user-data folder (survives reinstalls). */
  storeGet<T = unknown>(key: string): Promise<T | undefined>;
  storeSet(key: string, value: unknown): Promise<void>;
  quit(): Promise<void>;
};

export const IPC = {
  host: "wms:host",
  printers: "wms:printers",
  openExternal: "wms:open-external",
  setFullscreen: "wms:set-fullscreen",
  isFullscreen: "wms:is-fullscreen",
  storeGet: "wms:store-get",
  storeSet: "wms:store-set",
  quit: "wms:quit",
} as const;
