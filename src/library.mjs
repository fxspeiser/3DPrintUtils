// Local file library — catalog, store, and manage 3D files

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const LIBRARY_DIR = process.env.LIBRARY_DIR || path.join(os.homedir(), '.3dprint-backporter', 'library');
const CATALOG_FILE = path.join(LIBRARY_DIR, 'catalog.json');

// Ensure library directory exists
function ensureLibraryDir() {
  if (!fs.existsSync(LIBRARY_DIR)) {
    fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  }
}

// Read catalog
function readCatalog() {
  ensureLibraryDir();
  if (!fs.existsSync(CATALOG_FILE)) {
    return { files: [] };
  }
  return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
}

// Write catalog
function writeCatalog(catalog) {
  ensureLibraryDir();
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf-8');
}

/**
 * Add a file to the library.
 * @param {string} sourcePath - Path to the file to import
 * @param {object} metadata - { name, tags, sourceUrl, description, category }
 * @returns {object} The catalog entry
 */
export function addFile(sourcePath, metadata = {}) {
  ensureLibraryDir();
  const catalog = readCatalog();

  const id = crypto.randomUUID();
  const ext = path.extname(sourcePath).toLowerCase();
  const storedName = `${id}${ext}`;
  const storedPath = path.join(LIBRARY_DIR, storedName);

  // Copy file to library
  fs.copyFileSync(sourcePath, storedPath);

  const stats = fs.statSync(storedPath);
  const entry = {
    id,
    name: metadata.name || path.basename(sourcePath, ext),
    filename: metadata.originalFilename || path.basename(sourcePath),
    storedName,
    format: ext,
    size: stats.size,
    tags: metadata.tags || [],
    category: metadata.category || 'uncategorized',
    description: metadata.description || '',
    sourceUrl: metadata.sourceUrl || '',
    addedAt: new Date().toISOString(),
    conversions: [],
  };

  catalog.files.push(entry);
  writeCatalog(catalog);
  return entry;
}

/**
 * Add a converted file as a child of an existing entry.
 */
export function addConversion(parentId, sourcePath, outputFormat) {
  ensureLibraryDir();
  const catalog = readCatalog();
  const parent = catalog.files.find(f => f.id === parentId);
  if (!parent) throw new Error(`Library entry "${parentId}" not found`);

  const convId = crypto.randomUUID();
  const ext = path.extname(sourcePath).toLowerCase();
  const storedName = `${convId}${ext}`;
  const storedPath = path.join(LIBRARY_DIR, storedName);

  fs.copyFileSync(sourcePath, storedPath);
  const stats = fs.statSync(storedPath);

  const conversion = {
    id: convId,
    storedName,
    format: ext,
    size: stats.size,
    convertedAt: new Date().toISOString(),
  };

  parent.conversions.push(conversion);
  writeCatalog(catalog);
  return conversion;
}

/**
 * List all files in the library, optionally filtered.
 */
export function listFiles({ search, category, format, tag } = {}) {
  const catalog = readCatalog();
  let files = catalog.files;

  if (search) {
    const q = search.toLowerCase();
    files = files.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  if (category) {
    files = files.filter(f => f.category === category);
  }
  if (format) {
    const ext = format.startsWith('.') ? format : `.${format}`;
    files = files.filter(f => f.format === ext);
  }
  if (tag) {
    files = files.filter(f => f.tags.includes(tag));
  }

  return files;
}

/**
 * Get a single file entry by ID.
 */
export function getFile(id) {
  const catalog = readCatalog();
  return catalog.files.find(f => f.id === id) || null;
}

/**
 * Get the stored file path for a catalog entry.
 */
export function getFilePath(id) {
  const entry = getFile(id);
  if (!entry) return null;
  return path.join(LIBRARY_DIR, entry.storedName);
}

/**
 * Get a conversion's stored file path.
 */
export function getConversionPath(fileId, conversionId) {
  const entry = getFile(fileId);
  if (!entry) return null;
  const conv = entry.conversions.find(c => c.id === conversionId);
  if (!conv) return null;
  return path.join(LIBRARY_DIR, conv.storedName);
}

/**
 * Update metadata for a file entry.
 */
export function updateFile(id, updates) {
  const catalog = readCatalog();
  const entry = catalog.files.find(f => f.id === id);
  if (!entry) throw new Error(`Library entry "${id}" not found`);

  const allowed = ['name', 'tags', 'category', 'description'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      entry[key] = updates[key];
    }
  }

  writeCatalog(catalog);
  return entry;
}

/**
 * Remove a file from the library.
 */
export function removeFile(id) {
  const catalog = readCatalog();
  const idx = catalog.files.findIndex(f => f.id === id);
  if (idx === -1) throw new Error(`Library entry "${id}" not found`);

  const entry = catalog.files[idx];

  // Delete stored file
  const filePath = path.join(LIBRARY_DIR, entry.storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  // Delete conversion files
  for (const conv of entry.conversions) {
    const convPath = path.join(LIBRARY_DIR, conv.storedName);
    if (fs.existsSync(convPath)) fs.unlinkSync(convPath);
  }

  catalog.files.splice(idx, 1);
  writeCatalog(catalog);
}

/**
 * Get library stats.
 */
export function getStats() {
  const catalog = readCatalog();
  const totalSize = catalog.files.reduce((sum, f) => {
    const convSize = f.conversions.reduce((s, c) => s + c.size, 0);
    return sum + f.size + convSize;
  }, 0);

  const categories = {};
  catalog.files.forEach(f => {
    categories[f.category] = (categories[f.category] || 0) + 1;
  });

  const formats = {};
  catalog.files.forEach(f => {
    formats[f.format] = (formats[f.format] || 0) + 1;
  });

  return {
    totalFiles: catalog.files.length,
    totalConversions: catalog.files.reduce((sum, f) => sum + f.conversions.length, 0),
    totalSize,
    categories,
    formats,
    libraryPath: LIBRARY_DIR,
  };
}

export { LIBRARY_DIR };
