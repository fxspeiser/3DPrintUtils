// Exporter wrapper — takes a Three.js Scene and writes to a file

import fs from 'fs';
import path from 'path';
import { getExporterConfig } from '../registry.mjs';

// Import all exporters
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { ColladaExporter } from 'three/examples/jsm/exporters/ColladaExporter.js';

const EXPORTER_CLASSES = {
  STLExporter,
  OBJExporter,
  GLTFExporter,
  PLYExporter,
  ColladaExporter,
};

/**
 * Export a Three.js Scene to a file.
 * @param {THREE.Scene} scene
 * @param {string} filePath - Output file path
 * @param {object} options - Export options (binary, etc.)
 * @returns {Promise<void>}
 */
export async function exportScene(scene, filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const config = getExporterConfig(ext);

  if (!config) {
    const { exporters } = await import('../registry.mjs');
    const supported = Object.keys(exporters).join(', ');
    throw new Error(`Unsupported output format "${ext}". Supported: ${supported}`);
  }

  const ExporterClass = EXPORTER_CLASSES[config.className];
  if (!ExporterClass) {
    throw new Error(`Exporter class "${config.className}" not found`);
  }

  const exporter = new ExporterClass();
  const exportOptions = { ...config.defaultOptions, ...options };

  let outputData;

  if (config.apiStyle === 'sync') {
    // STLExporter, OBJExporter
    outputData = exporter.parse(scene, exportOptions);
  } else if (config.apiStyle === 'async') {
    // GLTFExporter — parseAsync returns JSON (gltf) or ArrayBuffer (glb)
    outputData = await exporter.parseAsync(scene, exportOptions);
  } else if (config.apiStyle === 'callback') {
    // PLYExporter, ColladaExporter
    outputData = await new Promise((resolve, reject) => {
      try {
        const result = exporter.parse(scene, (data) => resolve(data), exportOptions);
        // ColladaExporter returns { data, textures } synchronously AND calls callback
        if (result && result.data) {
          resolve(result.data);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  // Ensure output directory exists
  const outputDir = path.dirname(filePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write to file based on data type
  if (outputData instanceof ArrayBuffer) {
    fs.writeFileSync(filePath, Buffer.from(outputData));
  } else if (outputData instanceof DataView) {
    fs.writeFileSync(filePath, Buffer.from(outputData.buffer));
  } else if (typeof outputData === 'string') {
    fs.writeFileSync(filePath, outputData, 'utf-8');
  } else if (typeof outputData === 'object') {
    // GLTF JSON
    fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2), 'utf-8');
  } else {
    fs.writeFileSync(filePath, outputData);
  }
}

/**
 * Export a scene to a Buffer (for web server responses) instead of a file.
 * @param {THREE.Scene} scene
 * @param {string} ext - Output extension (e.g. '.stl')
 * @param {object} options
 * @returns {Promise<Buffer>}
 */
export async function exportSceneToBuffer(scene, ext, options = {}) {
  const config = getExporterConfig(ext);

  if (!config) {
    throw new Error(`Unsupported output format "${ext}"`);
  }

  const ExporterClass = EXPORTER_CLASSES[config.className];
  const exporter = new ExporterClass();
  const exportOptions = { ...config.defaultOptions, ...options };

  let outputData;

  if (config.apiStyle === 'sync') {
    outputData = exporter.parse(scene, exportOptions);
  } else if (config.apiStyle === 'async') {
    outputData = await exporter.parseAsync(scene, exportOptions);
  } else if (config.apiStyle === 'callback') {
    outputData = await new Promise((resolve, reject) => {
      try {
        const result = exporter.parse(scene, (data) => resolve(data), exportOptions);
        if (result && result.data) {
          resolve(result.data);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  if (outputData instanceof ArrayBuffer) {
    return Buffer.from(outputData);
  } else if (outputData instanceof DataView) {
    return Buffer.from(outputData.buffer);
  } else if (typeof outputData === 'string') {
    return Buffer.from(outputData, 'utf-8');
  } else if (typeof outputData === 'object') {
    return Buffer.from(JSON.stringify(outputData, null, 2), 'utf-8');
  }
  return Buffer.from(outputData);
}
