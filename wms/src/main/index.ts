import { app, BrowserWindow, ipcMain, shell, Menu } from "electron";
import { hostname } from "os";
import { join } from "path";
import { IPC } from "../shared/ipc";
import { JsonStore } from "./store";

const store = new JsonStore(join(app.getPath("userData"), "aera-wms.json"));
let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: "Aera WMS",
    backgroundColor: "#f3f4f6",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => {
    win?.show();
    if (store.get("kiosk") === true) win?.setFullScreen(true);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  win.on("closed", () => {
    win = null;
  });
}

function registerIpc() {
  ipcMain.handle(IPC.host, () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    hostname: hostname(),
  }));
  ipcMain.handle(IPC.printers, async () => {
    if (!win) return [];
    const list = await win.webContents.getPrintersAsync();
    return list.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: (p.options as Record<string, string> | undefined)?.["printer-is-default"] === "true",
    }));
  });
  ipcMain.handle(IPC.openExternal, (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
  });
  ipcMain.handle(IPC.setFullscreen, (_event, on: boolean) => {
    win?.setFullScreen(on);
    store.set("kiosk", on);
    return win?.isFullScreen() ?? false;
  });
  ipcMain.handle(IPC.isFullscreen, () => win?.isFullScreen() ?? false);
  ipcMain.handle(IPC.storeGet, (_event, key: string) => store.get(key));
  ipcMain.handle(IPC.storeSet, (_event, key: string, value: unknown) => {
    if (value === undefined) store.delete(key);
    else store.set(key, value);
  });
  ipcMain.handle(IPC.quit, () => app.quit());
}

app.setName("Aera WMS");

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: "appMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
      ]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
