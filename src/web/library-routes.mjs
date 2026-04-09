// Express API routes for the local file library

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  addFile, addConversion, listFiles, getFile, getFilePath,
  getConversionPath, updateFile, removeFile, getStats
} from '../library.mjs';
import { convert } from '../pipeline.mjs';
import { getSupportedInputExtensions } from '../registry.mjs';

const inputExts = getSupportedInputExtensions();

const upload = multer({
  dest: path.join(os.tmpdir(), '3dprint-backporter'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (inputExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported format "${ext}".`));
    }
  },
});

export const libraryRouter = Router();

// GET /api/library — list files
libraryRouter.get('/', (req, res) => {
  try {
    const files = listFiles({
      search: req.query.search,
      category: req.query.category,
      format: req.query.format,
      tag: req.query.tag,
    });
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/library/stats — library statistics
libraryRouter.get('/stats', (req, res) => {
  try {
    res.json(getStats());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/library — upload and add file to library
libraryRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputExt = path.extname(req.file.originalname).toLowerCase();
  const renamedPath = `${req.file.path}${inputExt}`;

  try {
    fs.renameSync(req.file.path, renamedPath);

    const tags = req.body.tags
      ? (typeof req.body.tags === 'string' ? req.body.tags.split(',').map(t => t.trim()) : req.body.tags)
      : [];

    const entry = addFile(renamedPath, {
      name: req.body.name || path.basename(req.file.originalname, inputExt),
      originalFilename: req.file.originalname,
      tags,
      category: req.body.category || 'uncategorized',
      description: req.body.description || '',
      sourceUrl: req.body.sourceUrl || '',
    });

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    try { fs.unlinkSync(renamedPath); } catch {}
  }
});

// GET /api/library/:id — get file details
libraryRouter.get('/:id', (req, res) => {
  const entry = getFile(req.params.id);
  if (!entry) return res.status(404).json({ error: 'File not found' });
  res.json(entry);
});

// PATCH /api/library/:id — update metadata
libraryRouter.patch('/:id', (req, res) => {
  try {
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.tags) updates.tags = typeof req.body.tags === 'string' ? req.body.tags.split(',').map(t => t.trim()) : req.body.tags;
    if (req.body.category) updates.category = req.body.category;
    if (req.body.description !== undefined) updates.description = req.body.description;

    const entry = updateFile(req.params.id, updates);
    res.json(entry);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
});

// DELETE /api/library/:id — remove file
libraryRouter.delete('/:id', (req, res) => {
  try {
    removeFile(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
});

// GET /api/library/:id/download — download original file
libraryRouter.get('/:id/download', (req, res) => {
  const entry = getFile(req.params.id);
  if (!entry) return res.status(404).json({ error: 'File not found' });

  const filePath = getFilePath(req.params.id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File missing from disk' });
  }

  res.download(filePath, entry.filename);
});

// GET /api/library/:id/conversions/:convId/download — download converted file
libraryRouter.get('/:id/conversions/:convId/download', (req, res) => {
  const entry = getFile(req.params.id);
  if (!entry) return res.status(404).json({ error: 'File not found' });

  const convPath = getConversionPath(req.params.id, req.params.convId);
  if (!convPath || !fs.existsSync(convPath)) {
    return res.status(404).json({ error: 'Conversion file not found' });
  }

  const conv = entry.conversions.find(c => c.id === req.params.convId);
  const downloadName = `${entry.name}${conv.format}`;
  res.download(convPath, downloadName);
});

// POST /api/library/:id/convert — convert a library file and store the result
libraryRouter.post('/:id/convert', async (req, res) => {
  const entry = getFile(req.params.id);
  if (!entry) return res.status(404).json({ error: 'File not found' });

  const filePath = getFilePath(req.params.id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File missing from disk' });
  }

  const outputFormat = req.body.outputFormat || '.stl';
  const outputExt = outputFormat.startsWith('.') ? outputFormat : `.${outputFormat}`;
  const tmpOutput = path.join(os.tmpdir(), `convert-${Date.now()}${outputExt}`);

  try {
    await convert(filePath, tmpOutput, {
      merge: req.body.merge === 'true' || req.body.merge === true,
      stripColor: req.body.stripColor === 'true' || req.body.stripColor === true,
      binary: req.body.binary !== 'false',
      quality: req.body.quality || 'rendering',
      scale: req.body.scale ? parseFloat(req.body.scale) : undefined,
      unitsFrom: req.body.unitsFrom || undefined,
      unitsTo: req.body.unitsTo || undefined,
      simplify: req.body.simplify ? parseFloat(req.body.simplify) : undefined,
    });

    const conversion = addConversion(req.params.id, tmpOutput, outputExt);
    res.json(conversion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    try { fs.unlinkSync(tmpOutput); } catch {}
  }
});

// Error handler
libraryRouter.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});
