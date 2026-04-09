// Express API routes for the web interface

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { convert, inspect } from '../pipeline.mjs';
import archiver from 'archiver';
import { getSupportedInputExtensions, getSupportedOutputExtensions, loaders, exporters } from '../registry.mjs';

const inputExts = getSupportedInputExtensions();
const outputExts = getSupportedOutputExtensions();

// Configure multer for file uploads
const upload = multer({
  dest: path.join(os.tmpdir(), '3dprint-backporter'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (inputExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported format "${ext}". Supported: ${inputExts.join(', ')}`));
    }
  },
});

export const router = Router();

// GET /api/formats — return supported formats
router.get('/formats', (req, res) => {
  const inputFormats = Object.entries(loaders).map(([ext, config]) => ({
    ext,
    name: config.name,
  }));
  const outputFormats = Object.entries(exporters).map(([ext, config]) => ({
    ext,
    name: config.name,
  }));
  res.json({ input: inputFormats, output: outputFormats });
});

// POST /api/info — inspect a file without converting
router.post('/info', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputPath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const renamedPath = `${inputPath}${ext}`;

  try {
    // Rename to include extension (loaders need it)
    fs.renameSync(inputPath, renamedPath);
    const info = await inspect(renamedPath);
    res.json({
      filename: req.file.originalname,
      format: ext,
      ...info,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    try { fs.unlinkSync(renamedPath); } catch {}
  }
});

// POST /api/convert — convert a file
router.post('/convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputExt = path.extname(req.file.originalname).toLowerCase();
  const inputPath = req.file.path;
  const renamedInput = `${inputPath}${inputExt}`;

  // Parse options from form fields
  const outputFormat = req.body.outputFormat || '.stl';
  const outputExt = outputFormat.startsWith('.') ? outputFormat : `.${outputFormat}`;

  if (!outputExts.includes(outputExt)) {
    try { fs.unlinkSync(inputPath); } catch {}
    return res.status(400).json({ error: `Unsupported output format "${outputExt}"` });
  }

  const outputName = path.basename(req.file.originalname, inputExt) + outputExt;
  const outputPath = path.join(os.tmpdir(), '3dprint-backporter', `output-${Date.now()}${outputExt}`);

  const options = {
    merge: req.body.merge === 'true' || req.body.merge === true,
    stripColor: req.body.stripColor === 'true' || req.body.stripColor === true,
    binary: req.body.binary !== 'false',
    scale: req.body.scale ? parseFloat(req.body.scale) : undefined,
    unitsFrom: req.body.unitsFrom || undefined,
    unitsTo: req.body.unitsTo || undefined,
    simplify: req.body.simplify ? parseFloat(req.body.simplify) : undefined,
    quality: req.body.quality || 'rendering',
  };

  try {
    // Rename to include extension
    fs.renameSync(inputPath, renamedInput);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await convert(renamedInput, outputPath, options);

    // Send the file for download
    res.download(outputPath, outputName, (err) => {
      // Clean up temp files
      try { fs.unlinkSync(renamedInput); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to send converted file' });
      }
    });
  } catch (error) {
    // Clean up on error
    try { fs.unlinkSync(renamedInput); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
    res.status(500).json({ error: error.message });
  }
});

// POST /api/convert/batch — convert multiple files, return a zip
router.post('/convert/batch', upload.array('files', 50), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const outputFormat = req.body.outputFormat || '.stl';
  const outputExt = outputFormat.startsWith('.') ? outputFormat : `.${outputFormat}`;

  if (!outputExts.includes(outputExt)) {
    req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    return res.status(400).json({ error: `Unsupported output format "${outputExt}"` });
  }

  const options = {
    merge: req.body.merge === 'true' || req.body.merge === true,
    stripColor: req.body.stripColor === 'true' || req.body.stripColor === true,
    binary: req.body.binary !== 'false',
    scale: req.body.scale ? parseFloat(req.body.scale) : undefined,
    unitsFrom: req.body.unitsFrom || undefined,
    unitsTo: req.body.unitsTo || undefined,
    simplify: req.body.simplify ? parseFloat(req.body.simplify) : undefined,
    quality: req.body.quality || 'rendering',
  };

  const tmpDir = path.join(os.tmpdir(), '3dprint-backporter', `batch-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const results = [];
  const outputFiles = [];

  for (const file of req.files) {
    const inputExt = path.extname(file.originalname).toLowerCase();
    const renamedInput = `${file.path}${inputExt}`;
    const baseName = path.basename(file.originalname, inputExt);
    const outputPath = path.join(tmpDir, `${baseName}${outputExt}`);

    try {
      fs.renameSync(file.path, renamedInput);
      await convert(renamedInput, outputPath, options);
      results.push({ filename: file.originalname, status: 'ok', outputName: `${baseName}${outputExt}` });
      outputFiles.push({ path: outputPath, name: `${baseName}${outputExt}` });
    } catch (error) {
      results.push({ filename: file.originalname, status: 'error', error: error.message });
    } finally {
      try { fs.unlinkSync(renamedInput); } catch {}
    }
  }

  if (outputFiles.length === 0) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return res.status(500).json({ error: 'All conversions failed', results });
  }

  // Single file — return directly
  if (outputFiles.length === 1) {
    return res.download(outputFiles[0].path, outputFiles[0].name, () => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  }

  // Multiple files — stream a zip
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="converted-${Date.now()}.zip"`);

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', () => res.status(500).end());
  archive.pipe(res);

  for (const file of outputFiles) {
    archive.file(file.path, { name: file.name });
  }

  archive.on('end', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  archive.finalize();
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 100MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});
