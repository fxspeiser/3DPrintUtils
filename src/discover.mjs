// Discover — search for prosthetic/medical 3D files and import from URLs

import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';
import { addFile } from './library.mjs';

/**
 * Curated directory of prosthetic and medical 3D file sources.
 * These are known, reputable repositories with free designs.
 */
export const CURATED_SOURCES = [
  {
    id: 'nih-3dprint',
    name: 'NIH 3D Print Exchange',
    url: 'https://3dprint.nih.gov',
    searchUrl: 'https://3dprint.nih.gov/discover',
    description: 'US National Institutes of Health repository of biomedical 3D models. Peer-reviewed prosthetic and anatomical models.',
    category: 'Medical / Prosthetics',
    tags: ['prosthetics', 'medical', 'anatomical', 'peer-reviewed', 'government'],
  },
  {
    id: 'enable',
    name: 'e-NABLE',
    url: 'https://enablingthefuture.org',
    searchUrl: 'https://hub.e-nable.org/s/e-nable-devices/wiki',
    description: 'Global volunteer network creating free 3D-printed prosthetic hands and arms. Hub for open-source assistive device designs.',
    category: 'Prosthetics',
    tags: ['prosthetics', 'hands', 'arms', 'open-source', 'assistive'],
  },
  {
    id: 'thingiverse-prosthetics',
    name: 'Thingiverse — Prosthetics',
    url: 'https://www.thingiverse.com',
    searchUrl: 'https://www.thingiverse.com/search?q=prosthetic&type=things',
    description: 'Largest 3D printing community. Extensive prosthetic and assistive device designs from the maker community.',
    category: 'Prosthetics',
    tags: ['prosthetics', 'community', 'maker', 'free'],
  },
  {
    id: 'thingiverse-medical',
    name: 'Thingiverse — Medical',
    url: 'https://www.thingiverse.com',
    searchUrl: 'https://www.thingiverse.com/search?q=medical+device&type=things',
    description: 'Medical devices and tools from the Thingiverse community.',
    category: 'Medical',
    tags: ['medical', 'tools', 'devices', 'community'],
  },
  {
    id: 'printables-prosthetics',
    name: 'Printables — Prosthetics',
    url: 'https://www.printables.com',
    searchUrl: 'https://www.printables.com/search/models?q=prosthetic',
    description: 'Prusa\'s community platform. High-quality prosthetic and assistive designs with print settings.',
    category: 'Prosthetics',
    tags: ['prosthetics', 'prusa', 'high-quality', 'print-settings'],
  },
  {
    id: 'printables-medical',
    name: 'Printables — Medical',
    url: 'https://www.printables.com',
    searchUrl: 'https://www.printables.com/search/models?q=medical',
    description: 'Medical models, tools, and devices on the Printables platform.',
    category: 'Medical',
    tags: ['medical', 'tools', 'prusa'],
  },
  {
    id: 'thangs-prosthetics',
    name: 'Thangs — Prosthetics',
    url: 'https://thangs.com',
    searchUrl: 'https://thangs.com/search/prosthetic?scope=all',
    description: 'Aggregated search across multiple 3D model repositories. Great for discovering prosthetic designs from many sources at once.',
    category: 'Prosthetics',
    tags: ['prosthetics', 'aggregator', 'multi-source'],
  },
  {
    id: 'grabcad-prosthetics',
    name: 'GrabCAD — Prosthetics',
    url: 'https://grabcad.com',
    searchUrl: 'https://grabcad.com/library?page=1&per_page=20&query=prosthetic',
    description: 'Engineering-grade CAD models. Detailed prosthetic designs from professional engineers.',
    category: 'Prosthetics',
    tags: ['prosthetics', 'engineering', 'CAD', 'professional'],
  },
  {
    id: 'myminifactory-prosthetics',
    name: 'MyMiniFactory — Prosthetics',
    url: 'https://www.myminifactory.com',
    searchUrl: 'https://www.myminifactory.com/search/?query=prosthetic',
    description: 'Curated 3D printing marketplace with tested prosthetic designs.',
    category: 'Prosthetics',
    tags: ['prosthetics', 'curated', 'tested'],
  },
  {
    id: 'open-bionics',
    name: 'Open Bionics — Hero Arm Files',
    url: 'https://openbionics.com',
    searchUrl: 'https://openbionics.com',
    description: 'Open-source bionic arm designs. Affordable 3D-printed prosthetic arms with grip patterns.',
    category: 'Prosthetics',
    tags: ['prosthetics', 'bionic', 'arms', 'open-source'],
  },
  {
    id: 'instructables-prosthetics',
    name: 'Instructables — Prosthetics',
    url: 'https://www.instructables.com',
    searchUrl: 'https://www.instructables.com/search/?q=prosthetic+3d+print',
    description: 'Step-by-step prosthetic build guides with downloadable 3D files.',
    category: 'Prosthetics',
    tags: ['prosthetics', 'tutorials', 'guides', 'step-by-step'],
  },
];

/**
 * Search curated sources by query.
 */
export function searchSources(query) {
  if (!query) return CURATED_SOURCES;
  const q = query.toLowerCase();
  return CURATED_SOURCES.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q) ||
    s.tags.some(t => t.includes(q))
  );
}

/**
 * Download a file from a URL to a temp location.
 * Returns the temp file path.
 */
export function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    const tmpDir = path.join(os.tmpdir(), '3dprint-backporter');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Derive filename from URL if not provided
    if (!filename) {
      const urlPath = new URL(url).pathname;
      filename = path.basename(urlPath) || 'download';
    }

    const tmpPath = path.join(tmpDir, `dl-${Date.now()}-${filename}`);
    const file = fs.createWriteStream(tmpPath);

    const client = url.startsWith('https') ? https : http;

    const doRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      client.get(requestUrl, { headers: { 'User-Agent': '3DPrint-Backporter/2.0' } }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, requestUrl).href;
          const redirectClient = redirectUrl.startsWith('https') ? https : http;
          // Need to use the correct client for the redirect
          redirectClient.get(redirectUrl, { headers: { 'User-Agent': '3DPrint-Backporter/2.0' } }, (rRes) => {
            if (rRes.statusCode >= 300 && rRes.statusCode < 400 && rRes.headers.location) {
              doRequest(new URL(rRes.headers.location, redirectUrl).href, redirectCount + 2);
              return;
            }
            if (rRes.statusCode !== 200) {
              reject(new Error(`Download failed: HTTP ${rRes.statusCode}`));
              return;
            }
            rRes.pipe(file);
            file.on('finish', () => file.close(() => resolve(tmpPath)));
          }).on('error', reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }

        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(tmpPath)));
      }).on('error', (err) => {
        fs.unlink(tmpPath, () => {});
        reject(err);
      });
    };

    doRequest(url);
  });
}

/**
 * Download a file from a URL and add it to the library.
 */
export async function importFromUrl(url, metadata = {}) {
  const urlObj = new URL(url);
  const urlFilename = path.basename(urlObj.pathname) || 'download.stl';

  const tmpPath = await downloadFile(url, urlFilename);

  try {
    const entry = addFile(tmpPath, {
      name: metadata.name || path.basename(urlFilename, path.extname(urlFilename)),
      tags: metadata.tags || [],
      category: metadata.category || 'downloaded',
      description: metadata.description || '',
      sourceUrl: url,
    });
    return entry;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}
