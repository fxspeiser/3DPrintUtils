# 3D Print Backporter

Convert modern 3D printing files to universally-supported formats for older printers. Designed to help people in the developing world print prosthetics and medical devices on older 3D printers that only support legacy file formats.

## The Problem

New prosthetic and medical device designs are published in modern formats like 3MF (with multi-color, multi-material support), but older printers — common in developing regions — only support STL and can only print in a single color. This tool bridges that gap.

## Features

- **9 input formats**: 3MF, GLTF, GLB, AMF, OBJ, FBX, STL, PLY, Collada (DAE)
- **6 output formats**: STL, OBJ, GLTF, GLB, PLY, Collada (DAE)
- **Batch conversion**: Convert multiple files or entire directories at once
- **Backporting transforms**: Strip colors/materials, merge multi-part models, unit conversion, mesh simplification
- **Quality modes**: Rendering Optimized (fast) or Manufacturing Precision (recomputed normals, degenerate face removal)
- **Three interfaces**: Command-line (CLI), REST API, and localhost web server with drag-and-drop UI
- **Local library**: Catalog, store, and manage your 3D files locally
- **Discover**: Curated directory of prosthetic/medical 3D file repositories with URL import

## Requirements

- Node.js 18 or later
- npm 8 or later

## Setup

```bash
git clone https://github.com/fxspeiser/3DPrintUtils.git
cd 3DPrintUtils
npm install
```

### Verify Your System

Run the setup script to check that everything is working:

```bash
node setup.mjs
```

This will:
1. Check Node.js and npm versions
2. Verify system resources (memory, disk space)
3. Confirm all dependencies are installed
4. Validate all project files are present
5. Run smoke tests (polyfills, Three.js, loaders, exporters, CLI, Vite build, Express, library)

If everything passes, you'll see a green checkmark for each test and a "Quick start" guide. If something fails, the script will tell you exactly what to fix.

## CLI Usage

### Single File

```bash
# Basic conversion — 3MF to STL (default output format)
node cli.mjs prosthetic-hand.3mf

# Specify output file
node cli.mjs model.3mf -o output.stl

# Merge multi-part model and strip colors (ideal for older single-color printers)
node cli.mjs prosthetic-hand.3mf -o hand.stl --merge --strip-color

# Manufacturing precision mode
node cli.mjs model.3mf -o output.stl -q manufacturing

# Convert GLTF to OBJ
node cli.mjs model.gltf -f obj

# Unit conversion (meters to millimeters)
node cli.mjs model.gltf -o output.stl --units-from m --units-to mm

# Scale by factor
node cli.mjs model.3mf -o output.stl --scale 2.0

# Simplify mesh (keep 50% of vertices)
node cli.mjs detailed-model.3mf -o simplified.stl --simplify 0.5

# Inspect file without converting
node cli.mjs model.3mf --info
```

### Multiple Files & Directories

```bash
# Convert multiple files
node cli.mjs hand.3mf arm.fbx leg.gltf

# Convert an entire directory (recursively finds all supported files)
node cli.mjs ./models/

# Output to a specific directory
node cli.mjs ./models/ -o ./converted/

# Mix of files and directories with options
node cli.mjs hand.3mf ./more-models/ -o ./output/ --merge --strip-color -q manufacturing
```

Batch mode shows per-file progress and a final summary of succeeded/failed conversions.

### CLI Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--output` | `-o` | Output file (single) or directory (batch) |
| `--format` | `-f` | Output format: stl, obj, gltf, glb, ply, dae (default: stl) |
| `--quality` | `-q` | `rendering` (default) or `manufacturing` |
| `--merge` | `-m` | Merge all meshes into one |
| `--strip-color` | `-s` | Remove materials and vertex colors |
| `--scale` | | Scale factor (e.g., 2.0) |
| `--units-from` | | Source units: mm, cm, m, inch |
| `--units-to` | | Target units: mm, cm, m, inch |
| `--simplify` | | Simplify ratio 0-1 (0.5 = keep 50%) |
| `--binary` | `-b` | Binary output (default: true) |
| `--info` | `-i` | Print file info only |

## Web Interface

### Development (with Vite HMR)

```bash
# Terminal 1 — API server
npm run dev:api

# Terminal 2 — Vite dev server with hot reload
npm run dev

# Open http://localhost:3737
```

### Production (single server)

```bash
npm run build   # Build the frontend
npm start       # Serve everything on http://localhost:3737
```

### Tabs

**Convert** — Upload one or more files (or an entire folder), select output format, configure options, convert and download. Multiple files are returned as a ZIP archive.

**Library** — Local file catalog. Upload files, tag them, search and filter, convert files in-place, download originals or conversions. Files are stored in `~/.3dprint-backporter/library/`.

**Discover** — Curated directory of 11 prosthetic and medical 3D file repositories (NIH 3D Print Exchange, e-NABLE, Thingiverse, Printables, Thangs, GrabCAD, MyMiniFactory, Open Bionics, Instructables). Paste a direct download URL to import files into your library.

## Quality Modes

- **Rendering Optimized** — Fast conversion using standard float32 precision. Good for previews and quick conversions.
- **Manufacturing Precision** — Recomputes vertex normals from face geometry, removes degenerate (zero-area) triangles, validates geometry integrity, reports bounding box dimensions. Use this when the output file will be sent directly to a slicer/printer.

## Supported Format Conversions

Any input format can be converted to any output format. The most common conversions for 3D printing:

| From | To | Use Case |
|------|----|----------|
| 3MF | STL | Most important — 3MF is the modern standard, STL is universal |
| GLTF/GLB | STL | Web/AR models to printable format |
| AMF | STL | Additive manufacturing format to universal |
| FBX | STL | Game/animation models to printable |
| OBJ | STL | With material stripping for single-color printers |

## REST API

The web server exposes a full REST API for programmatic access.

### Conversion

```bash
# Convert a single file
curl -X POST http://localhost:3737/api/convert \
  -F "file=@prosthetic-hand.3mf" \
  -F "outputFormat=.stl" \
  -F "merge=true" \
  -F "stripColor=true" \
  -F "quality=manufacturing" \
  -o output.stl

# Batch convert multiple files (returns ZIP)
curl -X POST http://localhost:3737/api/convert/batch \
  -F "files=@hand.3mf" \
  -F "files=@arm.fbx" \
  -F "outputFormat=.stl" \
  -F "merge=true" \
  -o converted.zip

# Inspect a file
curl -X POST http://localhost:3737/api/info \
  -F "file=@model.3mf"

# List supported formats
curl http://localhost:3737/api/formats
```

### Library

```bash
# Add a file to library
curl -X POST http://localhost:3737/api/library \
  -F "file=@hand.3mf" \
  -F "name=Prosthetic Hand" \
  -F "tags=prosthetic,hand,e-nable" \
  -F "category=prosthetics"

# List library files
curl http://localhost:3737/api/library?search=hand

# Convert a library file
curl -X POST http://localhost:3737/api/library/<id>/convert \
  -H "Content-Type: application/json" \
  -d '{"outputFormat":".stl","merge":true,"stripColor":true}'

# Download a file
curl http://localhost:3737/api/library/<id>/download -o file.3mf
```

### Discover

```bash
# List curated sources
curl http://localhost:3737/api/discover/sources

# Search sources
curl "http://localhost:3737/api/discover/sources?q=prosthetic"

# Import a file from URL into library
curl -X POST http://localhost:3737/api/discover/import \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/hand.stl","name":"Prosthetic Hand","tags":["prosthetic"]}'
```

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Vite dev server on :3737 with HMR |
| `dev:api` | `node server.mjs` | Express API server on :3738 |
| `build` | `vite build` | Production frontend build → `dist/` |
| `start` | `NODE_ENV=production node server.mjs` | Production server on :3737 |
| `convert` | `node cli.mjs` | CLI conversion |

## Project Structure

```
3DPrintUtils/
├── setup.mjs               # System verification & smoke tests
├── cli.mjs                  # CLI entry point (yargs, single + batch)
├── server.mjs               # Express API server (dev: :3738, prod: :3737)
├── vite.config.js           # Vite config (root: web/, proxy /api → Express)
├── package.json             # Dependencies, scripts, "type": "module"
├── CLAUDE.md                # Agentic instructions for AI assistants
├── web/                     # Frontend (served by Vite)
│   ├── index.html           # Three-tab UI (Convert, Library, Discover)
│   ├── main.js              # All frontend logic
│   └── style.css            # All styles
├── src/
│   ├── polyfills.mjs        # Node.js polyfills for Three.js
│   ├── registry.mjs         # Format → loader/exporter mapping
│   ├── pipeline.mjs         # Core: convert(), batchConvert(), inspect()
│   ├── transforms.mjs       # stripMaterials, mergeMeshes, scale, simplify, manufacturing
│   ├── library.mjs          # Local file catalog engine
│   ├── discover.mjs         # Curated sources + URL import
│   ├── loaders/
│   │   └── index.mjs        # loadScene(filePath) → THREE.Scene
│   ├── exporters/
│   │   └── index.mjs        # exportScene(scene, filePath) → file
│   └── web/
│       ├── routes.mjs       # /api/formats, /api/convert, /api/convert/batch, /api/info
│       ├── library-routes.mjs  # /api/library CRUD
│       └── discover-routes.mjs # /api/discover/sources, /api/discover/import
└── dist/                    # Vite production build output (gitignored)
```

## For AI Agents

See [CLAUDE.md](CLAUDE.md) for detailed agentic instructions including:
- Architecture overview and module map
- How to add new formats, transforms, and curated sources
- Critical rules (polyfill import order, `.parse()` vs `.load()`, port numbers)
- Full REST API reference with all endpoints, fields, and types
- Testing commands

## License

MIT License. Copyright (c) 2023 Frank Speiser. See [LICENSE](LICENSE) for details.
