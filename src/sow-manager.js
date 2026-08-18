// ===========================================
// ScopeGuard — SOW Manager (Postgres)
// ===========================================
// Reads and caches SOW documents from the Postgres database.

import { dbLoadSOW, dbListSOWs, dbSaveSOW } from './database.js';

// In-memory cache of loaded SOWs
const sowCache = new Map();

/**
 * Load a SOW file by filename.
 * @param {string} filename - The SOW filename (e.g. "acme-corp.md")
 * @returns {Promise<string|null>} The SOW content, or null if not found
 */
export async function loadSOW(filename) {
  // Check cache first
  if (sowCache.has(filename)) {
    return sowCache.get(filename);
  }

  const content = await dbLoadSOW(filename);

  if (!content) {
    console.error(`⚠️  SOW file not found in database: ${filename}`);
    return null;
  }

  sowCache.set(filename, content);
  console.log(`📄 Loaded SOW from Postgres: ${filename} (${content.length} chars)`);
  return content;
}

/**
 * Save a SOW file to the database.
 * @param {string} filename 
 * @param {string} content 
 */
export async function saveSOW(filename, content) {
  await dbSaveSOW(filename, content);
  clearSOWCache();
}

/**
 * List all available SOW files.
 * @returns {Promise<string[]>} Array of filenames
 */
export async function listSOWFiles() {
  return await dbListSOWs();
}

/**
 * Clear the SOW cache (useful if files are updated).
 */
export function clearSOWCache() {
  sowCache.clear();
}
