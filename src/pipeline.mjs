// Core conversion pipeline: Load → Transform → Export

import path from 'path';
import fs from 'fs';
import { loadScene, getSceneInfo } from './loaders/index.mjs';
import { exportScene, exportSceneToBuffer } from './exporters/index.mjs';
import { stripMaterials, mergeMeshes, applyScale, convertUnits, simplifyMesh, applyManufacturingMode, getBoundingBox } from './transforms.mjs';
import { getSupportedInputExtensions } from './registry.mjs';

/**
 * Convert a 3D file with optional transforms.
 *
 * @param {string} inputPath - Path to input file
 * @param {string} outputPath - Path to output file
 * @param {object} options
 * @param {boolean} options.merge - Merge all meshes into one
 * @param {boolean} options.stripColor - Remove materials and vertex colors
 * @param {number} options.scale - Scale factor
 * @param {string} options.unitsFrom - Source units (mm, cm, m, inch)
 * @param {string} options.unitsTo - Target units
 * @param {number} options.simplify - Simplification ratio (0-1)
 * @param {boolean} options.binary - Use binary output format
 * @param {string} options.quality - Quality mode: 'rendering' (default) or 'manufacturing'
 * @returns {Promise<{scene: THREE.Scene, info: object}>}
 */
export async function convert(inputPath, outputPath, options = {}) {
  const quality = options.quality || 'rendering';

  // Load
  console.log(`Loading: ${path.basename(inputPath)}`);
  console.log(`  Quality mode: ${quality === 'manufacturing' ? 'Manufacturing Precision' : 'Rendering Optimized'}`);
  let scene = await loadScene(inputPath);
  const inputInfo = getSceneInfo(scene);
  console.log(`  ${inputInfo.meshCount} mesh(es), ${inputInfo.totalVertices} vertices, ${inputInfo.totalFaces} faces`);

  // Apply transforms
  if (options.stripColor) {
    console.log('  Stripping materials and colors...');
    scene = stripMaterials(scene);
  }

  if (options.merge) {
    console.log('  Merging meshes...');
    scene = mergeMeshes(scene);
  }

  if (options.unitsFrom && options.unitsTo) {
    console.log(`  Converting units: ${options.unitsFrom} → ${options.unitsTo}`);
    scene = convertUnits(scene, options.unitsFrom, options.unitsTo);
  } else if (options.scale) {
    console.log(`  Applying scale: ${options.scale}x`);
    scene = applyScale(scene, options.scale);
  }

  if (options.simplify && options.simplify > 0 && options.simplify < 1) {
    console.log(`  Simplifying to ${Math.round(options.simplify * 100)}% of vertices...`);
    scene = await simplifyMesh(scene, options.simplify);
  }

  // Apply manufacturing mode post-processing
  if (quality === 'manufacturing') {
    console.log('  Applying manufacturing precision post-processing...');
    scene = applyManufacturingMode(scene);
    const bbox = getBoundingBox(scene);
    console.log(`  Bounding box: ${bbox.dimensions.x.toFixed(2)} x ${bbox.dimensions.y.toFixed(2)} x ${bbox.dimensions.z.toFixed(2)}`);
  }

  // Export
  const exportOptions = {};
  if (options.binary !== undefined) {
    exportOptions.binary = options.binary;
  }

  console.log(`Exporting: ${path.basename(outputPath)}`);
  await exportScene(scene, outputPath, exportOptions);

  const outputInfo = getSceneInfo(scene);
  console.log(`  ${outputInfo.meshCount} mesh(es), ${outputInfo.totalVertices} vertices, ${outputInfo.totalFaces} faces`);

  return { scene, inputInfo, outputInfo };
}

/**
 * Convert and return a Buffer (for web server use).
 */
export async function convertToBuffer(inputPath, outputExt, options = {}) {
  let scene = await loadScene(inputPath);

  if (options.stripColor) {
    scene = stripMaterials(scene);
  }
  if (options.merge) {
    scene = mergeMeshes(scene);
  }
  if (options.unitsFrom && options.unitsTo) {
    scene = convertUnits(scene, options.unitsFrom, options.unitsTo);
  } else if (options.scale) {
    scene = applyScale(scene, options.scale);
  }
  if (options.simplify && options.simplify > 0 && options.simplify < 1) {
    scene = await simplifyMesh(scene, options.simplify);
  }
  if (options.quality === 'manufacturing') {
    scene = applyManufacturingMode(scene);
  }

  const exportOptions = {};
  if (options.binary !== undefined) {
    exportOptions.binary = options.binary;
  }

  return exportSceneToBuffer(scene, outputExt, exportOptions);
}

/**
 * Load a file and return scene info without converting.
 */
export async function inspect(inputPath) {
  const scene = await loadScene(inputPath);
  return getSceneInfo(scene);
}

/**
 * Resolve a list of input paths that may include files, directories, and globs
 * into a flat list of supported 3D files.
 */
export function resolveInputPaths(inputs) {
  const supportedExts = getSupportedInputExtensions();
  const files = [];

  for (const input of inputs) {
    const resolved = path.resolve(input);

    if (!fs.existsSync(resolved)) {
      console.warn(`Warning: "${input}" not found, skipping.`);
      continue;
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      // Recursively find all supported files in directory
      collectFiles(resolved, supportedExts, files);
    } else if (stat.isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      if (supportedExts.includes(ext)) {
        files.push(resolved);
      } else {
        console.warn(`Warning: "${input}" is not a supported format, skipping.`);
      }
    }
  }

  return files;
}

function collectFiles(dir, supportedExts, result) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, supportedExts, result);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (supportedExts.includes(ext)) {
        result.push(fullPath);
      }
    }
  }
}

/**
 * Batch convert multiple files.
 * @param {string[]} inputPaths - Array of file paths
 * @param {object} options - Same as convert(), plus:
 * @param {string} options.outputDir - Output directory (default: same dir as input)
 * @param {string} options.outputFormat - Output extension (e.g. '.stl')
 * @param {function} options.onProgress - Callback: (index, total, inputPath, status, error?) => void
 * @returns {Promise<{results: Array}>}
 */
export async function batchConvert(inputPaths, options = {}) {
  const outputFormat = options.outputFormat || '.stl';
  const outputDir = options.outputDir ? path.resolve(options.outputDir) : null;
  const total = inputPaths.length;
  const results = [];

  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`\nBatch converting ${total} file(s) → ${outputFormat}\n`);

  for (let i = 0; i < total; i++) {
    const inputPath = inputPaths[i];
    const inputExt = path.extname(inputPath).toLowerCase();
    const baseName = path.basename(inputPath, inputExt);
    const outputPath = outputDir
      ? path.join(outputDir, baseName + outputFormat)
      : inputPath.replace(new RegExp(`\\${inputExt}$`), outputFormat);

    console.log(`[${i + 1}/${total}] ${path.basename(inputPath)}`);

    try {
      const { inputInfo, outputInfo } = await convert(inputPath, outputPath, options);
      const result = { inputPath, outputPath, status: 'ok', inputInfo, outputInfo };
      results.push(result);
      if (options.onProgress) options.onProgress(i, total, inputPath, 'ok');
    } catch (error) {
      console.error(`  FAILED: ${error.message}`);
      const result = { inputPath, outputPath, status: 'error', error: error.message };
      results.push(result);
      if (options.onProgress) options.onProgress(i, total, inputPath, 'error', error.message);
    }

    console.log();
  }

  const succeeded = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;
  console.log(`Batch complete: ${succeeded} succeeded, ${failed} failed out of ${total} file(s).\n`);

  return { results, succeeded, failed, total };
}
