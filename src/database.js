// ===========================================
// ScopeGuard — Database Layer (PostgreSQL)
// ===========================================
// Handles persistent storage: project mappings,
// drift logs, and SOW metadata.

import pkg from 'pg';
const { Pool } = pkg;
import { config } from './config.js';

let pool;

/**
 * Initialize the database and create tables.
 */
export async function initDatabase() {
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false } // Required for cloud DBs
  });

  await pool.query(`
    -- Maps Slack channels to specific SOW projects
    CREATE TABLE IF NOT EXISTS project_mappings (
      channel_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      sow_filename TEXT NOT NULL,
      pm_user_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Logs every drift evaluation for audit trail
    CREATE TABLE IF NOT EXISTS drift_logs (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Stores SOW file contents (stateless storage)
    CREATE TABLE IF NOT EXISTS sows (
      filename TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('✅ PostgreSQL Database initialized');
}

// ── Project Mapping CRUD ──

/**
 * Map a Slack channel to a project SOW.
 */
export async function setProjectMapping(channelId, projectId, projectName, sowFilename, pmUserId) {
  const query = `
    INSERT INTO project_mappings (channel_id, project_id, project_name, sow_filename, pm_user_id, updated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT (channel_id) DO UPDATE SET
      project_id = EXCLUDED.project_id,
      project_name = EXCLUDED.project_name,
      sow_filename = EXCLUDED.sow_filename,
      pm_user_id = EXCLUDED.pm_user_id,
      updated_at = CURRENT_TIMESTAMP
  `;
  await pool.query(query, [channelId, projectId, projectName, sowFilename, pmUserId]);
}

/**
 * Get the project mapping for a channel.
 * @returns {{ channel_id, project_id, project_name, sow_filename, pm_user_id } | undefined}
 */
export async function getProjectMapping(channelId) {
  const res = await pool.query('SELECT * FROM project_mappings WHERE channel_id = $1', [channelId]);
  return res.rows[0];
}

/**
 * Get all project mappings.
 */
export async function getAllProjectMappings() {
  const res = await pool.query('SELECT * FROM project_mappings ORDER BY project_name');
  return res.rows;
}

/**
 * Delete a project mapping.
 */
export async function deleteProjectMapping(channelId) {
  await pool.query('DELETE FROM project_mappings WHERE channel_id = $1', [channelId]);
}

/**
 * Update the PM for a project mapping.
 */
export async function updateProjectPM(channelId, newPmUserId) {
  await pool.query('UPDATE project_mappings SET pm_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE channel_id = $2', [newPmUserId, channelId]);
}

// ── Drift Log CRUD ──

/**
 * Save a drift evaluation to the audit trail.
 */
export async function saveDriftLog(entry) {
  const query = `
    INSERT INTO drift_logs (
      channel_id, project_id, message_ts, message_text, user_id,
      intent_classification, drift_verdict, drift_reasoning, cr_draft, sow_sections_referenced
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `;
  await pool.query(query, [
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
  ]);
}

/**
 * Get recent drift logs for a project.
 */
export async function getRecentDriftLogs(projectId, limit = 10) {
  const res = await pool.query(
    'SELECT * FROM drift_logs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2',
    [projectId, limit]
  );
  return res.rows;
}

// ── SOW Storage (Postgres) ──

export async function dbSaveSOW(filename, content) {
  const query = `
    INSERT INTO sows (filename, content, updated_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (filename) DO UPDATE SET
      content = EXCLUDED.content,
      updated_at = CURRENT_TIMESTAMP
  `;
  await pool.query(query, [filename, content]);
}

export async function dbLoadSOW(filename) {
  const res = await pool.query('SELECT content FROM sows WHERE filename = $1', [filename]);
  return res.rows[0]?.content || null;
}

export async function dbListSOWs() {
  const res = await pool.query('SELECT filename FROM sows ORDER BY filename');
  return res.rows.map(row => row.filename);
}
