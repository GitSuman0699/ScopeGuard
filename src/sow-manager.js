// ===========================================
// ScopeGuard — SOW Manager
// ===========================================
// Reads and caches SOW documents from the data/sows/ folder.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOWS_DIR = path.join(__dirname, '..', 'data', 'sows');

// In-memory cache of loaded SOWs
const sowCache = new Map();

/**
 * Load a SOW file by filename.
 * @param {string} filename - The SOW filename (e.g. "acme-corp.md")
 * @returns {string|null} The SOW content, or null if not found
 */
export function loadSOW(filename) {
  // Check cache first
  if (sowCache.has(filename)) {
    return sowCache.get(filename);
  }

  const filePath = path.join(SOWS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.error(`⚠️  SOW file not found: ${filePath}`);
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  sowCache.set(filename, content);
  console.log(`📄 Loaded SOW: ${filename} (${content.length} chars)`);
  return content;
}

/**
 * List all available SOW files.
 * @returns {string[]} Array of filenames
 */
export function listSOWFiles() {
  if (!fs.existsSync(SOWS_DIR)) {
    fs.mkdirSync(SOWS_DIR, { recursive: true });
    return [];
  }
  return fs.readdirSync(SOWS_DIR).filter((f) => f.endsWith('.md'));
}

/**
 * Clear the SOW cache (useful if files are updated).
 */
export function clearSOWCache() {
  sowCache.clear();
}
