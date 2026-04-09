#!/usr/bin/env node

/**
 * 3D Print Backporter — Setup & System Test
 *
 * Verifies the system meets all requirements, installs dependencies,
 * and runs a smoke test to confirm everything works.
 *
 * Usage:  node setup.mjs
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PASS = '\x1b[32m\u2713\x1b[0m';
const FAIL = '\x1b[31m\u2717\x1b[0m';
const WARN = '\x1b[33m!\x1b[0m';
const BOLD = '\x1b[1m';
const DIM  = '\x1b[2m';
const RESET = '\x1b[0m';

let errors = 0;
let warnings = 0;

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function section(title) { console.log(`\n${BOLD}${title}${RESET}`); }

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return null; }
}

function semver(str) {
  const m = str?.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
}

function gte(v, min) {
  if (!v || !min) return false;
  for (let i = 0; i < 3; i++) {
    if (v[i] > min[i]) return true;
    if (v[i] < min[i]) return false;
  }
  return true;
}

// ──────────────────────────────────────────────────────────────
console.log(`\n${BOLD}===  3D Print Backporter — Setup & System Test  ===${RESET}\n`);

// 1. Node.js
section('1. Node.js Runtime');

const nodeVersion = run('node --version');
const nodeSemver = semver(nodeVersion);

if (!nodeVersion) {
  log(FAIL, 'Node.js not found. Install from https://nodejs.org (v18+).');
  errors++;
} else if (!gte(nodeSemver, [18, 0, 0])) {
  log(FAIL, `Node.js ${nodeVersion} found — v18.0.0+ required.`);
  log('', 'Upgrade: https://nodejs.org or use nvm: nvm install 18');
  errors++;
} else {
  log(PASS, `Node.js ${nodeVersion}`);
}

// 2. npm
const npmVersion = run('npm --version');
const npmSemver = semver(npmVersion);

if (!npmVersion) {
  log(FAIL, 'npm not found.');
  errors++;
} else if (!gte(npmSemver, [8, 0, 0])) {
  log(WARN, `npm ${npmVersion} — v8+ recommended. Run: npm install -g npm`);
  warnings++;
} else {
  log(PASS, `npm ${npmVersion}`);
}

// 3. OS & Architecture
section('2. System');

const platform = process.platform;
const arch = process.arch;
const mem = Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10;

log(PASS, `Platform: ${platform} (${arch})`);
log(mem >= 2 ? PASS : WARN, `Memory: ${mem} GB${mem < 2 ? ' — 2 GB+ recommended for large files' : ''}`);
if (mem < 2) warnings++;

// 4. Disk space
const diskFree = run(process.platform === 'win32'
  ? 'wmic logicaldisk get freespace /format:csv'
  : `df -k "${__dirname}" | tail -1 | awk '{print $4}'`);

if (diskFree) {
  const freeGB = Math.round(parseInt(diskFree) / 1024 / 1024 * 10) / 10;
  log(freeGB >= 1 ? PASS : WARN, `Disk free: ${freeGB} GB${freeGB < 1 ? ' — 1 GB+ recommended' : ''}`);
  if (freeGB < 1) warnings++;
}

// 5. Dependencies
section('3. Dependencies');

const pkgPath = path.join(__dirname, 'package.json');
const nodeModulesPath = path.join(__dirname, 'node_modules');

if (!fs.existsSync(pkgPath)) {
  log(FAIL, 'package.json not found — are you in the project root?');
  errors++;
} else {
  log(PASS, 'package.json found');

  const needsInstall = !fs.existsSync(nodeModulesPath);

  if (needsInstall) {
    log(WARN, 'node_modules/ not found — installing dependencies...');
    try {
      execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
      log(PASS, 'Dependencies installed');
    } catch {
      log(FAIL, 'npm install failed. Check your network connection and try again.');
      errors++;
    }
  } else {
    log(PASS, 'node_modules/ present');
  }

  // Check key packages
  const required = ['three', 'express', 'yargs', 'linkedom', 'multer', 'vite', 'archiver'];
  for (const pkg of required) {
    const pkgDir = path.join(nodeModulesPath, pkg);
    if (fs.existsSync(pkgDir)) {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
      log(PASS, `${pkg} ${DIM}${pkgJson.version}${RESET}`);
    } else {
      log(FAIL, `${pkg} not installed`);
      errors++;
    }
  }
}

// 6. Project files
section('4. Project Structure');

const requiredFiles = [
  'cli.mjs',
  'server.mjs',
  'vite.config.js',
  'src/polyfills.mjs',
  'src/registry.mjs',
  'src/pipeline.mjs',
  'src/transforms.mjs',
  'src/library.mjs',
  'src/discover.mjs',
  'src/loaders/index.mjs',
  'src/exporters/index.mjs',
  'src/web/routes.mjs',
  'src/web/library-routes.mjs',
  'src/web/discover-routes.mjs',
  'web/index.html',
  'web/main.js',
  'web/style.css',
];

let missingFiles = 0;
for (const f of requiredFiles) {
  if (fs.existsSync(path.join(__dirname, f))) {
    log(PASS, f);
  } else {
    log(FAIL, `${f} — MISSING`);
    missingFiles++;
    errors++;
  }
}

// 7. Smoke tests
section('5. Smoke Tests');

if (errors === 0) {
  // Test: polyfills load
  try {
    await import('./src/polyfills.mjs');
    log(PASS, 'Polyfills load (linkedom DOMParser, globalThis stubs)');
  } catch (e) {
    log(FAIL, `Polyfills failed: ${e.message}`);
    errors++;
  }

  // Test: registry loads
  try {
    const { getSupportedInputExtensions, getSupportedOutputExtensions } = await import('./src/registry.mjs');
    const inputs = getSupportedInputExtensions();
    const outputs = getSupportedOutputExtensions();
    log(PASS, `Format registry: ${inputs.length} input formats, ${outputs.length} output formats`);
  } catch (e) {
    log(FAIL, `Registry failed: ${e.message}`);
    errors++;
  }

  // Test: Three.js loads in Node
  try {
    const THREE = await import('three');
    log(PASS, `Three.js r${THREE.REVISION} loads in Node.js`);
  } catch (e) {
    log(FAIL, `Three.js failed: ${e.message}`);
    errors++;
  }

  // Test: loaders import
  try {
    await import('./src/loaders/index.mjs');
    log(PASS, 'All loaders import (3MF, AMF, FBX, GLTF, OBJ, STL, PLY, Collada)');
  } catch (e) {
    log(FAIL, `Loaders failed: ${e.message}`);
    errors++;
  }

  // Test: exporters import
  try {
    await import('./src/exporters/index.mjs');
    log(PASS, 'All exporters import (STL, OBJ, GLTF, PLY, Collada)');
  } catch (e) {
    log(FAIL, `Exporters failed: ${e.message}`);
    errors++;
  }

  // Test: CLI --help
  try {
    const helpOutput = run(`node "${path.join(__dirname, 'cli.mjs')}" --help`);
    if (helpOutput?.includes('3D Print Backporter')) {
      log(PASS, 'CLI loads and responds to --help');
    } else {
      throw new Error('Unexpected output');
    }
  } catch (e) {
    log(FAIL, `CLI failed: ${e.message}`);
    errors++;
  }

  // Test: Vite build
  try {
    const buildOut = run(`npx vite build --outDir "${path.join(__dirname, 'dist')}" 2>&1`);
    if (fs.existsSync(path.join(__dirname, 'dist', 'index.html'))) {
      log(PASS, 'Vite production build succeeds');
    } else {
      throw new Error('dist/index.html not generated');
    }
  } catch (e) {
    log(FAIL, `Vite build failed: ${e.message}`);
    errors++;
  }

  // Test: express server can bind
  try {
    const express = (await import('express')).default;
    const app = express();
    await new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        server.close(resolve);
      });
      server.on('error', reject);
    });
    log(PASS, 'Express server can bind to a port');
  } catch (e) {
    log(FAIL, `Express failed: ${e.message}`);
    errors++;
  }

  // Test: library directory writable
  try {
    const libDir = path.join(os.homedir(), '.3dprint-backporter', 'library');
    fs.mkdirSync(libDir, { recursive: true });
    const testFile = path.join(libDir, '.setup-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    log(PASS, `Library directory writable: ${libDir}`);
  } catch (e) {
    log(FAIL, `Library directory not writable: ${e.message}`);
    errors++;
  }
} else {
  log(WARN, 'Skipping smoke tests — fix the errors above first.');
}

// ──────────────────────────────────────────────────────────────
section('Results');

if (errors === 0 && warnings === 0) {
  console.log(`\n  ${PASS} ${BOLD}All checks passed! Your system is ready.${RESET}\n`);
  console.log('  Quick start:');
  console.log('    CLI:     node cli.mjs <file.3mf> -o output.stl');
  console.log('    Web:     npm run dev:api  (terminal 1)');
  console.log('             npm run dev      (terminal 2)');
  console.log('             Open http://localhost:3737\n');
} else if (errors === 0) {
  console.log(`\n  ${WARN} ${BOLD}All checks passed with ${warnings} warning(s).${RESET}`);
  console.log('  The tool should work, but review the warnings above.\n');
} else {
  console.log(`\n  ${FAIL} ${BOLD}${errors} error(s) and ${warnings} warning(s) found.${RESET}`);
  console.log('  Fix the errors above before using the tool.\n');
  process.exit(1);
}
