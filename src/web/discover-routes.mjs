// Express API routes for discovering and importing 3D files

import { Router } from 'express';
import express from 'express';
import { searchSources, importFromUrl, CURATED_SOURCES } from '../discover.mjs';

export const discoverRouter = Router();
discoverRouter.use(express.json());

// GET /api/discover/sources — list curated sources
discoverRouter.get('/sources', (req, res) => {
  const query = req.query.q || '';
  const sources = query ? searchSources(query) : CURATED_SOURCES;
  res.json({ sources });
});

// POST /api/discover/import — download a file from URL into library
discoverRouter.post('/import', async (req, res) => {
  const { url, name, tags, category, description } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const entry = await importFromUrl(url, {
      name: name || '',
      tags: tags || [],
      category: category || 'downloaded',
      description: description || '',
    });
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: `Import failed: ${error.message}` });
  }
});
