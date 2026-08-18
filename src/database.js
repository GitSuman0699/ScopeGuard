// ===========================================
// ScopeGuard — Database Layer
// ===========================================
// Handles persistent storage: project mappings,
// drift logs, and SOW metadata.

import Database from 'better-sqlite3';
import { config } from './config.js';
import fs from 'fs';
import path from 'path';

let db;

/**
 * Initialize the database and create tables.
 */
export function initDatabase() {
  // Ensure the data directory exists
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    -- Maps Slack channels to specific SOW projects
    CREATE TABLE IF NOT EXISTS project_mappings (
      channel_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      sow_filename TEXT NOT NULL,
      pm_user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Logs every drift evaluation for audit trail
    CREATE TABLE IF NOT EXISTS drift_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      message_ts TEXT NOT NULL,
      message_text TEXT NOT NULL,
      user_id TEXT NOT NULL,
      intent_classification TEXT,
      drift_verdict TEXT,
      drift_reasoning TEXT,
      cr_draft TEXT,
      sow_sections_referenced TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log('✅ Database initialized');
  return db;
}

// ── Project Mapping CRUD ──

/**
 * Map a Slack channel to a project SOW.
 */
export function setProjectMapping(channelId, projectId, projectName, sowFilename, pmUserId) {
  const stmt = db.prepare(`
    INSERT INTO project_mappings (channel_id, project_id, project_name, sow_filename, pm_user_id, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(channel_id) DO UPDATE SET
      project_id = excluded.project_id,
      project_name = excluded.project_name,
      sow_filename = excluded.sow_filename,
      pm_user_id = excluded.pm_user_id,
      updated_at = datetime('now')
  `);
  stmt.run(channelId, projectId, projectName, sowFilename, pmUserId);
}

/**
 * Get the project mapping for a channel.
 * @returns {{ channel_id, project_id, project_name, sow_filename, pm_user_id } | undefined}
 */
export function getProjectMapping(channelId) {
  return db.prepare('SELECT * FROM project_mappings WHERE channel_id = ?').get(channelId);
}

/**
 * Get all project mappings.
 */
export function getAllProjectMappings() {
  return db.prepare('SELECT * FROM project_mappings ORDER BY project_name').all();
}

/**
 * Delete a project mapping.
 */
export function deleteProjectMapping(channelId) {
  db.prepare('DELETE FROM project_mappings WHERE channel_id = ?').run(channelId);
}

// ── Drift Log CRUD ──

/**
 * Save a drift evaluation to the audit trail.
 */
export function saveDriftLog(entry) {
  const stmt = db.prepare(`
    INSERT INTO drift_logs (
      channel_id, project_id, message_ts, message_text, user_id,
      intent_classification, drift_verdict, drift_reasoning, cr_draft, sow_sections_referenced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    entry.channelId,
    entry.projectId,
    entry.messageTs,
    entry.messageText,
    entry.userId,
    entry.intentClassification,
    entry.driftVerdict,
    entry.driftReasoning,
    entry.crDraft,
    JSON.stringify(entry.sowSectionsReferenced || [])
  );
}

/**
 * Get recent drift logs for a project.
 */
export function getRecentDriftLogs(projectId, limit = 10) {
  return db.prepare(
    'SELECT * FROM drift_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(projectId, limit);
}
