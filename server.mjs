#!/usr/bin/env node

// Polyfills must load first
import './src/polyfills.mjs';

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { router } from './src/web/routes.mjs';
import { libraryRouter } from './src/web/library-routes.mjs';
import { discoverRouter } from './src/web/discover-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || (isDev ? 3738 : 3737);

// API routes
app.use('/api', router);
app.use('/api/library', libraryRouter);
app.use('/api/discover', discoverRouter);

// In production, serve the Vite-built static files
const distPath = path.join(__dirname, 'dist');
if (!isDev && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n--- 3D Print Backporter API ---`);
  console.log(`API server: http://localhost:${PORT}/api`);
  if (isDev) {
    console.log(`\nDev mode: run "npm run dev" in another terminal for the UI.`);
    console.log(`UI will be at: http://localhost:3737`);
  } else {
    console.log(`Web UI:    http://localhost:${PORT}`);
  }
  console.log();
});
