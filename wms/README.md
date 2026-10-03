# Aera WMS

Touch-first desktop client (Windows, macOS) for the Aera ERP. Runs as an Electron app and talks to the ERP through `/api/wms/*` with an API key.

```
npm install
npm run dev        # Electron + Vite with hot reload
npm run typecheck
npm run dist:mac   # DMG (arm64 + x64)  -> release/
npm run dist:win   # NSIS installer      -> release/
```

Releases are built by `.github/workflows/wms-release.yml` whenever a tag `wms-v*` is pushed. The ERP's *Settings → Downloads* page links to the latest release assets.

## Layout

```
src/main/        Electron main process (window, IPC: printers, settings, version)
src/preload/     Context bridge -> window.wms
src/shared/      Types shared between main, preload and renderer (IPC + API contract)
src/renderer/
  app/           Shell, routing, keyboard shortcuts
  ui/            Touch primitives (BigButton, Panel, ScanInput, KeyHint, ...)
  data/          WmsDataSource interface + demo source + HTTP source
  features/      One folder per module (dashboard, receiving, picklists, fastship, internal, returns, settings)
  lib/           Settings store, scanner wedge, formatting, i18n
```

Each module owns its own folder and only talks to the data layer through `useData()`. New functions are added by creating a feature folder and registering a route in `app/routes.tsx` and a nav entry in `app/nav.ts`.
