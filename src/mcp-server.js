// ===========================================
// ScopeGuard — MCP Server
// ===========================================
// Exposes SOW management tools via the Model Context Protocol.
// This fulfills the hackathon's "MCP Server Integration" requirement.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadSOW, listSOWFiles } from './sow-manager.js';
import { getProjectMapping, getAllProjectMappings, getRecentDriftLogs } from './database.js';
import { initDatabase } from './database.js';

// Initialize database for standalone MCP usage
initDatabase();

const server = new McpServer({
  name: 'scopeguard-mcp',
  version: '1.0.0',
  description:
    'ScopeGuard — Scope Drift Detection for project management. Fetch SOWs, evaluate scope, and review drift history.',
});

// ── Tool: fetch_sow ──

server.tool(
  'fetch_project_sow',
  'Fetch the Statement of Work (SOW) document for a specific project by its SOW filename. Returns the full SOW content.',
  { sowFilename: z.string().describe('The SOW filename (e.g., "acme-corp.md")') },
  async ({ sowFilename }) => {
    const content = loadSOW(sowFilename);
    if (!content) {
      return {
        content: [{ type: 'text', text: `SOW file "${sowFilename}" not found.` }],
      };
    }
    return {
      content: [{ type: 'text', text: content }],
    };
  }
);

// ── Tool: list_sows ──

server.tool(
  'list_available_sows',
  'List all available Statement of Work (SOW) files.',
  {},
  async () => {
    const files = listSOWFiles();
    if (files.length === 0) {
      return {
        content: [{ type: 'text', text: 'No SOW files found in data/sows/ directory.' }],
      };
    }
    return {
      content: [{ type: 'text', text: `Available SOWs:\n${files.map((f) => `- ${f}`).join('\n')}` }],
    };
  }
);

// ── Tool: get_project_mapping ──

server.tool(
  'get_channel_project',
  'Get the project and SOW mapping for a specific Slack channel ID.',
  { channelId: z.string().describe('The Slack channel ID') },
  async ({ channelId }) => {
    const mapping = getProjectMapping(channelId);
    if (!mapping) {
      return {
        content: [{ type: 'text', text: `No project mapped to channel ${channelId}.` }],
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(mapping, null, 2) }],
    };
  }
);

// ── Tool: get_drift_history ──

server.tool(
  'get_drift_history',
  'Get recent scope drift evaluations for a project. Useful for reviewing past scope change attempts.',
  {
    projectId: z.string().describe('The project ID to get drift history for'),
    limit: z.number().optional().describe('Max results to return (default 10)'),
  },
  async ({ projectId, limit }) => {
    const logs = getRecentDriftLogs(projectId, limit || 10);
    if (logs.length === 0) {
      return {
        content: [{ type: 'text', text: `No drift evaluations found for project "${projectId}".` }],
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: logs
            .map(
              (l) =>
                `[${l.created_at}] ${l.drift_verdict} — "${l.message_text.substring(0, 80)}..." (${l.drift_reasoning?.substring(0, 100)}...)`
            )
            .join('\n\n'),
        },
      ],
    };
  }
);

// ── Tool: list_all_projects ──

server.tool(
  'list_all_projects',
  'List all projects and their Slack channel mappings.',
  {},
  async () => {
    const mappings = getAllProjectMappings();
    if (mappings.length === 0) {
      return {
        content: [{ type: 'text', text: 'No projects configured yet.' }],
      };
    }
    const text = mappings
      .map((m) => `- *${m.project_name}* (${m.project_id}) → SOW: ${m.sow_filename}, Channel: ${m.channel_id}`)
      .join('\n');
    return {
      content: [{ type: 'text', text: `Configured Projects:\n${text}` }],
    };
  }
);

// ── Start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ScopeGuard MCP server running on stdio');
}

main().catch(console.error);
