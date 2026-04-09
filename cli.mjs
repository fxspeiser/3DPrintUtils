#!/usr/bin/env node

// Polyfills must load first
import './src/polyfills.mjs';

import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { convert, inspect, batchConvert, resolveInputPaths } from './src/pipeline.mjs';
import { getSupportedInputExtensions, getSupportedOutputExtensions } from './src/registry.mjs';

const inputFormats = getSupportedInputExtensions();
const outputFormats = getSupportedOutputExtensions();

const argv = yargs(hideBin(process.argv))
  .usage('3D Print Backporter — Convert modern 3D files for older printers\n\nUsage: $0 <input...> [options]\n\nAccepts one or more files, directories, or a mix of both.')
  .option('output', {
    alias: 'o',
    describe: 'Output file (single) or directory (batch)',
    type: 'string',
  })
  .option('format', {
    alias: 'f',
    describe: 'Output format',
    choices: outputFormats.map(e => e.replace('.', '')),
    default: 'stl',
  })
  .option('merge', {
    alias: 'm',
    describe: 'Merge all meshes into a single mesh',
    type: 'boolean',
    default: false,
  })
  .option('strip-color', {
    alias: 's',
    describe: 'Remove materials and vertex colors (for single-color printers)',
    type: 'boolean',
    default: false,
  })
  .option('scale', {
    describe: 'Scale factor (e.g., 2.0 to double size)',
    type: 'number',
  })
  .option('units-from', {
    describe: 'Source units',
    choices: ['mm', 'cm', 'm', 'inch'],
  })
  .option('units-to', {
    describe: 'Target units',
    choices: ['mm', 'cm', 'm', 'inch'],
  })
  .option('simplify', {
    describe: 'Simplify ratio (0-1, e.g., 0.5 = keep 50% of vertices)',
    type: 'number',
  })
  .option('binary', {
    alias: 'b',
    describe: 'Use binary output format (smaller files)',
    type: 'boolean',
    default: true,
  })
  .option('quality', {
    alias: 'q',
    describe: 'Quality mode',
    choices: ['rendering', 'manufacturing'],
    default: 'rendering',
  })
  .option('info', {
    alias: 'i',
    describe: 'Print file info only (no conversion)',
    type: 'boolean',
    default: false,
  })
  .example('$0 hand.3mf', 'Convert one file to STL')
  .example('$0 *.3mf -o ./converted/', 'Batch convert all 3MF files to a directory')
  .example('$0 ./models/ --merge --strip-color', 'Convert entire directory')
  .example('$0 a.fbx b.gltf c.3mf -f obj', 'Convert multiple files to OBJ')
  .example('$0 ./models/ -o ./stl/ -q manufacturing', 'Directory with manufacturing precision')
  .example('$0 model.3mf --info', 'Show file info without converting')
  .epilog(`Supported input formats: ${inputFormats.join(', ')}\nSupported output formats: ${outputFormats.join(', ')}\n\nHelping bring prosthetics and medical devices to every 3D printer.`)
  .help()
  .argv;

async function main() {
  const rawInputs = argv._;

  if (rawInputs.length === 0) {
    console.error('Error: No input files or directories specified. Use --help for usage info.');
    process.exit(1);
  }

  // Resolve all inputs (files, directories) into a flat list of supported files
  const filePaths = resolveInputPaths(rawInputs.map(String));

  if (filePaths.length === 0) {
    console.error('Error: No supported 3D files found in the given inputs.');
    console.error(`Supported: ${inputFormats.join(', ')}`);
    process.exit(1);
  }

  const outputExt = `.${argv.format}`;
  const options = {
    merge: argv.merge,
    stripColor: argv.stripColor,
    scale: argv.scale,
    unitsFrom: argv.unitsFrom,
    unitsTo: argv.unitsTo,
    simplify: argv.simplify,
    binary: argv.binary,
    quality: argv.quality,
  };

  // Info-only mode
  if (argv.info) {
    for (const filePath of filePaths) {
      try {
        const info = await inspect(filePath);
        const ext = path.extname(filePath).toLowerCase();
        console.log(`\nFile: ${path.basename(filePath)}`);
        console.log(`Format: ${ext}`);
        console.log(`Meshes: ${info.meshCount}`);
        console.log(`Vertices: ${info.totalVertices.toLocaleString()}`);
        console.log(`Faces: ${info.totalFaces.toLocaleString()}`);
        console.log(`Has vertex colors: ${info.hasColors ? 'Yes' : 'No'}`);
        console.log(`Has materials: ${info.hasMaterials ? 'Yes' : 'No'}`);
        if (info.materialTypes.length > 0) {
          console.log(`Material types: ${info.materialTypes.join(', ')}`);
        }
      } catch (error) {
        console.error(`Error inspecting ${path.basename(filePath)}: ${error.message}`);
      }
    }
    return;
  }

  console.log('\n--- 3D Print Backporter ---\n');

  // Single file mode
  if (filePaths.length === 1 && !isDirectory(argv.output)) {
    const inputPath = filePaths[0];
    const inputExt = path.extname(inputPath).toLowerCase();
    const outputPath = argv.output
      ? path.resolve(argv.output)
      : inputPath.replace(new RegExp(`\\${inputExt}$`), outputExt);

    try {
      await convert(inputPath, outputPath, options);
      console.log(`\nDone! Output saved to: ${outputPath}\n`);
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      if (process.env.DEBUG) console.error(error.stack);
      process.exit(1);
    }
    return;
  }

  // Batch mode
  const outputDir = argv.output ? path.resolve(argv.output) : null;

  try {
    const { succeeded, failed, total } = await batchConvert(filePaths, {
      ...options,
      outputDir,
      outputFormat: outputExt,
    });

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`\nBatch error: ${error.message}`);
    if (process.env.DEBUG) console.error(error.stack);
    process.exit(1);
  }
}

function isDirectory(p) {
  if (!p) return false;
  try {
    return fs.statSync(path.resolve(p)).isDirectory();
  } catch {
    // If it doesn't exist but ends with / or has no extension, treat as directory
    return p.endsWith('/') || p.endsWith(path.sep) || !path.extname(p);
  }
}

main();
