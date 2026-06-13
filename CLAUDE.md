# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ametra OS** (MedicinaEcuador Pro) is a medical/dental clinic management system for Ecuador. It is a monorepo with two independent npm projects:

- `Backend_NodeJS/` — Node.js/Express REST API (v3.0.0)
- `medicSystemcore/` — Electron desktop application (v4.5.1)

The architecture is a thin Electron client backed by a local Express server. Both run on the same Windows machine for each clinic installation.

---

## Commands

### Backend (`Backend_NodeJS/`)

```bash
npm start                  # Start the API server (node server.js, port 8000)
npm run build:obfuscate   # Obfuscate source for production → ./dist
```

There is no test runner or linter configured.

### Frontend (`medicSystemcore/`)

```bash
npm start           # Launch Electron app
npm run build:dir   # Build to dist/ (directory, no installer)
npm run dist        # Full Windows installer build (.exe + .msi)
```

---

## Architecture

### Backend (`Backend_NodeJS/`)

**Pattern**: Route → Controller → Raw SQL (no ORM)

- `server.js` — Entry point. Registers all routes, Socket.IO, cron jobs, error handlers, and startup checks (DB connection, required directories, `BASE_MAESTRA_NACIONAL.csv`).
- `config/db.js` — MSSQL connection pool with automatic retry every 5 seconds on failure.
- `routes/` — Express routers, all protected by `middlewares/authMiddleware.js` except `/api/auth`.
- `controllers/` — Business logic. All DB queries are raw SQL via the `mssql` pool. No query builder or ORM.
- `services/whatsappService.js` — WhatsApp automation via `whatsapp-web.js` + Puppeteer. Session state lives in `sessions/`.
- `uploads/` — User-uploaded files (clinic logos, invoices, clinical images). Served statically.

**Auth**: JWT (12h expiry). Token is verified in `authMiddleware.js` on every route. The secret falls back to a hardcoded string if `JWT_SECRET` env var is absent.

**Real-time**: Socket.IO broadcasts a `db-update` event `{ modulo, id_referencia }` to all clients after any successful write operation. Clients use this to refresh their views without polling.

**Scheduled task**: A cron job at `23:00` daily auto-closes any open cash registers (`Caja` table, Estado='CERRADA').

**Ecuador SRI invoicing**: `facturacionController.js` generates signed XML invoices using `xadesjs` / `xml-crypto`. Digital certificates (P12) are uploaded by the user and stored in `uploads/facturacion/`.

**AI integration** (`iaController.js`): Google Gemini API for clinical consultation assistance. Primary model: `gemini-2.5-flash-lite`. Falls back to `gemini-2.5-flash` → `gemini-2.0-flash` → `gemma-3-4b-it`. Configured in `.env` via `POLITICA_API_KEY`, `IA_MODEL_NAME`, and `IA_FALLBACK_MODELS`.

### Frontend (`medicSystemcore/`)

**Pattern**: Electron main process → IPC bridge (preload.js) → Renderer (vanilla JS + HTML)

- `main.js` — Creates the `BrowserWindow`, loads `config.json` for API URL, disables DevTools in production (`MODO_DEBUG: false`).
- `preload.js` — Exposes a limited `window.electronAPI` surface via `contextBridge`. The renderer cannot access Node.js directly.
- `views/` — Plain HTML pages (one per module). Navigation loads new HTML files into the same window.
- `js/app.js` — Frontend application entry point.
- `js/api.js` — HTTP client that reads the API base URL from `window.electronAPI` / `config.json`.
- `js/uimodules/` — Per-module UI components.

The Electron app has `contextIsolation: true` and `nodeIntegration: false`. All backend communication goes through `fetch()` calls to the local Express server at `http://127.0.0.1:8000/api`.

### Configuration

- Backend environment: `Backend_NodeJS/.env` (DB credentials, Gemini API key, mail credentials, port)
- Frontend API target: `medicSystemcore/config.json` (`URL_PRODUCCION`, `URL_DESARROLLO`, `MODO_DEBUG`)
- The `.env` file contains real credentials — do not commit changes to it.

### Database

Microsoft SQL Server, database `SistemaOdonto_Pro`. Key tables: `Usuarios`, `Roles`, `Clinicas`, `Pacientes`, `Citas`, `Caja`, `Tratamientos`, `Recetas`, `Pagos`, `Facturas`, `Gastos`, `Inventario`, `Odontograma`.

All SQL is written directly in controller files as template literals passed to `mssql`'s `pool.request()`. There is no migration system; schema changes must be applied manually to the SQL Server instance.

### Production Build — Windows

The backend is obfuscated with `javascript-obfuscator` before distribution. The Electron app is packaged with `electron-builder` into a Windows installer. Node.js runtime and the backend server are bundled together via an Inno Setup script (`backend_final.iss`). The server is registered as a Windows service using NSSM.

### Production Build — macOS

Build is triggered via GitHub Actions (`.github/workflows/build-mac.yml`) because macOS binaries cannot be cross-compiled from Windows.

The workflow produces two artifacts:
- `AmetraOS-Desktop-Mac` — `.dmg` with the Electron app (x64 + arm64)
- `AmetraOS-Backend-Mac` — `.pkg` that installs the obfuscated backend as a **launchd system daemon** (equivalent to NSSM on Windows)

The PKG installer (`Backend_NodeJS/installer/mac/`):
- `preinstall.sh` — stops old service if upgrading
- `postinstall.sh` — detects node path, creates `.env`, generates and loads a launchd plist at `/Library/LaunchDaemons/com.casrodsoft.ametraos.backend.plist`
- `uninstall.sh` — run manually with `sudo bash uninstall.sh`

**Prerequisites on the Mac client:**
- Node.js 24 LTS (from nodejs.org)
- Docker Desktop + SQL Server container (SQL Server does not run natively on macOS)
- Google Chrome (for WhatsApp automation)
- `brew install openjdk@11` only if the clinic uses SRI electronic invoicing

**Icon requirement**: add `medicSystemcore/assets/icon.png` (512×512 or larger) or `icon.icns`. The workflow converts PNG → ICNS automatically using macOS `sips`/`iconutil`.
