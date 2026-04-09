# CLAUDE.md — Agentic Instructions for 3D Print Backporter

This file provides context and instructions for AI agents (Claude Code, Copilot, Cursor, etc.) working on this project.

## Project Overview

**3D Print Backporter** converts modern 3D printing files to universally-supported formats so older printers in developing regions can print prosthetics and medical devices. It is a Node.js application with a CLI, REST API, and Vite-powered web UI.

## Architecture

```
Input File → [Loader] → Three.js Scene → [Transforms] → [Exporter] → Output File
```

All format conversions go through a universal Three.js Scene intermediate representation. This means N loaders + M exporters gives N×M conversion combinations without individual converter code.

### Key Modules

| File | Purpose |
|------|---------|
| `cli.mjs` | CLI entry point. Uses yargs. Supports single file, multiple files, directories. |
| `server.mjs` | Express API server. Port 3738 (dev) / 3737 (prod). |
| `vite.config.js` | Vite dev server config. Port 3737 with `/api` proxy to Express. |
| `src/polyfills.mjs` | **Must be imported first** in any entry point. Provides DOMParser (linkedom), window/self/document stubs, ProgressEvent, Image, FileReader for Three.js in Node.js. |
| `src/registry.mjs` | Maps file extensions to Three.js loader/exporter classes with parse API metadata. |
| `src/loaders/index.mjs` | `loadScene(filePath)` → reads file, picks loader from registry, returns `THREE.Scene`. |
| `src/exporters/index.mjs` | `exportScene(scene, filePath, options)` → picks exporter, writes file. Also `exportSceneToBuffer()` for web responses. |
| `src/transforms.mjs` | Scene transforms: `stripMaterials`, `mergeMeshes`, `applyScale`, `convertUnits`, `simplifyMesh`, `applyManufacturingMode`. |
| `src/pipeline.mjs` | Orchestrates load → transform → export. `convert()`, `batchConvert()`, `inspect()`, `resolveInputPaths()`. |
| `src/library.mjs` | Local file catalog. Stores files in `~/.3dprint-backporter/library/` with JSON metadata. |
| `src/discover.mjs` | Curated prosthetic/medical 3D file sources + URL download/import. |
| `src/web/routes.mjs` | Express routes: `GET /api/formats`, `POST /api/info`, `POST /api/convert`, `POST /api/convert/batch`. |
| `src/web/library-routes.mjs` | Express routes: CRUD for `/api/library`, convert-in-library, download. |
| `src/web/discover-routes.mjs` | Express routes: `GET /api/discover/sources`, `POST /api/discover/import`. |
| `web/index.html` | Vite-served frontend. Three tabs: Convert, Library, Discover. |
| `web/main.js` | Frontend logic. All UI state and API calls. |
| `web/style.css` | All styles. CSS variables for theming. |

## Tech Stack

- **Runtime**: Node.js 18+ (ES modules, `"type": "module"` in package.json)
- **3D Engine**: Three.js 0.150.1 (loaders + exporters from `three/examples/jsm/`)
- **DOM Polyfill**: linkedom (for DOMParser — needed by 3MF/AMF/Collada loaders)
- **CLI**: yargs
- **Web Server**: Express 4 + multer (file uploads) + archiver (zip for batch)
- **Frontend**: Vite 8 (dev server with HMR, production build)
- **No TypeScript, no React, no bundler plugins** — pure ES modules throughout

## Commands

```bash
node setup.mjs          # Verify system & run smoke tests
npm run dev:api          # Start Express API on :3738
npm run dev              # Start Vite dev server on :3737 (proxies /api to :3738)
npm run build            # Vite production build → dist/
npm start                # Production: Express serves API + dist/ on :3737
node cli.mjs --help      # CLI help
```

## Supported Formats

**Input (9)**: `.3mf`, `.amf`, `.fbx`, `.gltf`, `.glb`, `.obj`, `.stl`, `.ply`, `.dae`
**Output (6)**: `.stl`, `.obj`, `.gltf`, `.glb`, `.ply`, `.dae`

## Critical Rules

1. **Always import `src/polyfills.mjs` before any Three.js import.** Three.js assumes a browser environment. Without polyfills, loaders crash on `DOMParser`, `window`, `document`, etc.

2. **Use `.parse()` not `.load()`** for Three.js loaders in Node.js. The `.load()` method uses HTTP fetching. The `.parse()` method accepts raw data (ArrayBuffer or string) directly.

3. **All loaders and exporters are registered in `src/registry.mjs`.** To add a new format, add an entry there and import the Three.js class in `src/loaders/index.mjs` or `src/exporters/index.mjs`.

4. **The web frontend is in `web/`, NOT `src/web/`.** `src/web/` contains Express route handlers (server-side). `web/` contains the Vite-served HTML/JS/CSS (client-side).

5. **Port 3737.** Dev mode: Vite on 3737, Express on 3738. Production: Express on 3737 serves everything.

6. **Library storage is at `~/.3dprint-backporter/library/`.** Files are stored with UUID filenames. Metadata is in `catalog.json`.

7. **No build step for the backend.** All server code is plain `.mjs` files that Node.js runs directly. Only the frontend needs `vite build`.

## Adding a New Input Format

1. Add entry to `src/registry.mjs` → `loaders` object with extension, Three.js module path, class name, input type (`'arraybuffer'` or `'string'`), and parse result type.
2. Import the loader class in `src/loaders/index.mjs` and add it to `LOADER_CLASSES`.
3. The file extension is automatically accepted by CLI, web upload, and API.

## Adding a New Output Format

1. Add entry to `src/registry.mjs` → `exporters` object with extension, Three.js module path, class name, and API style (`'sync'`, `'async'`, or `'callback'`).
2. Import the exporter class in `src/exporters/index.mjs` and add it to `EXPORTER_CLASSES`.

## Adding a New Transform

1. Add the function to `src/transforms.mjs`.
2. Wire it into `src/pipeline.mjs` → `convert()` and `convertToBuffer()`.
3. Add CLI option in `cli.mjs`.
4. Add UI control in `web/index.html` and `web/main.js`.
5. Parse the option in `src/web/routes.mjs`.

## Adding a New Curated Source

Add an entry to the `CURATED_SOURCES` array in `src/discover.mjs`. Fields: `id`, `name`, `url`, `searchUrl`, `description`, `category`, `tags`.

## Testing

```bash
# System check
node setup.mjs

# CLI smoke test
node cli.mjs <any-3d-file> -o /tmp/test.stl --merge --strip-color

# Batch test
node cli.mjs ./some-directory/ -o /tmp/output/ -q manufacturing

# API test (start server first)
curl -s http://localhost:3737/api/formats | head
curl -X POST http://localhost:3737/api/convert -F "file=@model.stl" -F "outputFormat=.obj" -o result.obj

# Inspect a file
node cli.mjs model.3mf --info
```

## REST API Reference

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/api/formats` | — | `{ input: [...], output: [...] }` |
| POST | `/api/info` | `file` (multipart) | `{ meshCount, totalVertices, totalFaces, hasColors, hasMaterials }` |
| POST | `/api/convert` | `file` + options (multipart) | Binary file download |
| POST | `/api/convert/batch` | `files[]` + options (multipart) | Single file or ZIP archive |
| GET | `/api/library` | `?search=&category=&format=` | `{ files: [...] }` |
| GET | `/api/library/stats` | — | `{ totalFiles, totalSize, categories, formats }` |
| POST | `/api/library` | `file` + metadata (multipart) | Catalog entry |
| GET | `/api/library/:id` | — | Catalog entry |
| PATCH | `/api/library/:id` | JSON `{ name, tags, category }` | Updated entry |
| DELETE | `/api/library/:id` | — | `{ ok: true }` |
| GET | `/api/library/:id/download` | — | Binary file download |
| POST | `/api/library/:id/convert` | JSON options | Conversion entry |
| GET | `/api/discover/sources` | `?q=` | `{ sources: [...] }` |
| POST | `/api/discover/import` | JSON `{ url, name, tags }` | Catalog entry |

### Convert/Batch Options (form fields)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `outputFormat` | string | `.stl` | Target format extension |
| `quality` | string | `rendering` | `rendering` or `manufacturing` |
| `merge` | boolean | `false` | Merge all meshes |
| `stripColor` | boolean | `false` | Remove materials/colors |
| `binary` | boolean | `true` | Binary output |
| `scale` | number | — | Scale factor |
| `unitsFrom` | string | — | Source units (mm/cm/m/inch) |
| `unitsTo` | string | — | Target units |
| `simplify` | number | — | Keep ratio 0-1 |

## Project Mission

This tool exists to help people in developing parts of the world print prosthetics and medical devices on older 3D printers. Design decisions should prioritize accessibility, broad compatibility, and simplicity. When in doubt, favor the approach that works on the most printers.
