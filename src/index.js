// ===========================================
// ScopeGuard — Main Entry Point
// ===========================================
// Slack bot that monitors channels for scope drift.
// Uses Socket Mode for local development.

import pkg from '@slack/bolt';
const { App } = pkg;

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { config, validateConfig } from './config.js';
import { initDatabase, getProjectMapping, setProjectMapping, saveDriftLog, getAllProjectMappings } from './database.js';
import { initScopeEngine, classifyIntent, analyzeDrift, generateCRDraft } from './scope-engine.js';
import { loadSOW, listSOWFiles, clearSOWCache, saveSOW } from './sow-manager.js';
import {
  renderDriftAlert,
  renderInScopeNotice,
  renderNoProjectMapped,
  renderSetupSuccess,
  renderThinking,
} from './blocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOWS_DIR = path.join(__dirname, '..', 'data', 'sows');

// ── Bootstrap ──

validateConfig();
await initDatabase();
initScopeEngine();

const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
});

// Store the bot's own user ID so we can ignore our own messages
let botUserId = null;

// ===========================================
// Slash Command: /scopeguard
// ===========================================

app.command('/scopeguard', async ({ command, ack, respond, client }) => {
  await ack();

  const subcommand = (command.text || '').trim().toLowerCase();

  // ── /scopeguard upload <project-name> ──
  if (subcommand.startsWith('upload')) {
    const parts = command.text.trim().split(/\s+/);
    if (parts.length < 2) {
      await respond({
        response_type: 'ephemeral',
        text: '*Usage:* Upload a SOW file (.txt, .md, or .pdf) with the message `upload <project-name>`.\n\n*Steps:*\n1. Open this DM or any channel with ScopeGuard\n2. Type `upload <project-name>` as your message\n3. Attach the SOW file (.txt, .md, or .pdf)\n4. Send the message\n\nOnce uploaded, use `/scopeguard setup` in a channel to link the SOW to that channel.',
      });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      text: `To upload the SOW for *${parts[1]}*, send a message in this DM with:\n\n1. Type \`upload ${parts[1]}\` as your message\n2. Attach the SOW file (.txt, .md, or .pdf)\n3. Send the message`,
    });
    return;
  }

  // ── /scopeguard setup <project-name> <sow-filename> ──
  if (subcommand.startsWith('setup')) {
    const parts = command.text.trim().split(/\s+/);
    // Expected: setup <project-name> <sow-filename>
    if (parts.length < 3) {
      const sowFiles = await listSOWFiles();
      await respond({
        response_type: 'ephemeral',
        text: `*Usage:* \`/scopeguard setup <project-name> <sow-filename>\`\n\n*Available SOW files:*\n${
          sowFiles.length > 0
            ? sowFiles.map((f) => `• \`${f}\``).join('\n')
            : '_No SOW files found._'
        }\n\n*Example:*\n\`/scopeguard setup acme-corp acme-corp.md\``,
      });
      return;
    }

    const projectName = parts[1];
    const sowFilename = parts[2];

    // Verify the SOW file exists
    const sowContent = await loadSOW(sowFilename);
    if (!sowContent) {
      const sowFiles = await listSOWFiles();
      await respond({
        response_type: 'ephemeral',
        text: `SOW file \`${sowFilename}\` not found. Available files:\n${sowFiles.map((f) => `• \`${f}\``).join('\n')}`,
      });
      return;
    }

    // Save the mapping
    await setProjectMapping(command.channel_id, projectName, projectName, sowFilename, command.user_id);

    await respond({
      response_type: 'ephemeral',
      blocks: renderSetupSuccess(projectName, sowFilename),
    });
    return;
  }

  // ── /scopeguard status ──
  if (subcommand === 'status') {
    const mapping = await getProjectMapping(command.channel_id);
    if (!mapping) {
      await respond({
        response_type: 'ephemeral',
        blocks: renderNoProjectMapped(),
      });
    } else {
      await respond({
        response_type: 'ephemeral',
        text: `*ScopeGuard — Active*\n*Project:* ${mapping.project_name}\n*SOW:* \`${mapping.sow_filename}\`\n*Project Manager:* <@${mapping.pm_user_id}>`,
      });
    }
    return;
  }

  // ── /scopeguard check <text> ──
  if (subcommand.startsWith('check')) {
    const textToCheck = command.text.replace(/^check\s*/i, '').trim();
    if (!textToCheck) {
      await respond({
        response_type: 'ephemeral',
        text: '*Usage:* `/scopeguard check Can we add a dark mode?`',
      });
      return;
    }

    // Run the full pipeline on this text
    await respond({ response_type: 'ephemeral', blocks: renderThinking() });
    await runScopeCheckPipeline(client, command.channel_id, command.user_id, textToCheck, respond);
    return;
  }

  // ── /scopeguard projects ──
  if (subcommand === 'projects') {
    const mappings = await getAllProjectMappings();
    if (mappings.length === 0) {
      await respond({
        response_type: 'ephemeral',
        text: 'No projects are configured yet. Use `/scopeguard setup` in a channel to get started.',
      });
      return;
    }

    const lines = mappings.map(
      (m) => `- *${m.project_name}* — SOW: \`${m.sow_filename}\` — PM: <@${m.pm_user_id}>`
    );
    await respond({
      response_type: 'ephemeral',
      text: `*Configured Projects:*\n${lines.join('\n')}`,
    });
    return;
  }

  // ── /scopeguard help (default) ──
  await respond({
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'ScopeGuard — Commands', emoji: false },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            '`/scopeguard setup <name> <sow-file>` — Link this channel to a project SOW',
            '`/scopeguard check <request>` — Manually check a request against the SOW',
            '`/scopeguard status` — Show the project mapped to this channel',
            '`/scopeguard projects` — List all configured projects',
            '`/scopeguard help` — Show this help message',
          ].join('\n'),
        },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'ScopeGuard passively monitors messages in mapped channels and alerts you when it detects potential scope drift.',
          },
        ],
      },
    ],
  });
});
// ===========================================
// Message Shortcut: "Check Scope" (right-click menu)
// ===========================================
// PM right-clicks a client message → "Check Scope" → ephemeral result.
// Client sees nothing.

app.shortcut('check_scope_shortcut', async ({ shortcut, ack, client }) => {
  await ack();

  const channelId = shortcut.channel.id;
  const messageText = shortcut.message.text;
  const pmUserId = shortcut.user.id;

  const mapping = await getProjectMapping(channelId);

  if (!mapping) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: pmUserId,
      blocks: renderNoProjectMapped(),
      text: 'No project mapped to this channel.',
    });
    return;
  }

  // Send thinking indicator
  await client.chat.postEphemeral({
    channel: channelId,
    user: pmUserId,
    blocks: renderThinking(),
    text: 'Analyzing request...',
  });

  try {
    const intent = { isFeatureRequest: true, confidence: 1.0, extractedRequest: messageText, reasoning: 'Manual shortcut check' };
    const sowText = await loadSOW(mapping.sow_filename);

    if (!sowText) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: pmUserId,
        text: `The SOW file \`${mapping.sow_filename}\` could not be found. Please re-upload the SOW document.`,
      });
      return;
    }

    const drift = await analyzeDrift(messageText, sowText, mapping.project_name);
    const crDraft = await generateCRDraft(drift, messageText, mapping.project_name);

    const blocks =
      drift.verdict === 'IN_SCOPE'
        ? renderInScopeNotice({ intent, drift, projectName: mapping.project_name })
        : renderDriftAlert({
            intent,
            drift,
            crDraft,
            projectName: mapping.project_name,
            originalMessage: messageText,
          });

    await client.chat.postEphemeral({
      channel: channelId,
      user: pmUserId,
      blocks,
      text: `Scope Check: ${drift.verdict}`,
    });

    await saveDriftLog({
      channelId,
      projectId: mapping.project_id,
      messageTs: shortcut.message.ts,
      messageText,
      userId: pmUserId,
      intentClassification: JSON.stringify(intent),
      driftVerdict: drift.verdict,
      driftReasoning: drift.reasoning,
      crDraft: crDraft || null,
      sowSectionsReferenced: drift.relevantSowSections,
    });
  } catch (error) {
    console.error('❌ Shortcut pipeline error:', error.message);
    await client.chat.postEphemeral({
      channel: channelId,
      user: pmUserId,
      text: `An error occurred during analysis: ${error.message}`,
    });
  }
});

// ===========================================
// Global Message Logger (for debugging)
// ===========================================
app.use(async ({ logger, payload, next }) => {
  if (payload.type === 'message') {
    console.log(`[DEBUG] Message received. Text: "${payload.text}", Files: ${payload.files ? payload.files.length : 0}, Subtype: ${payload.subtype}`);
  }
  await next();
});

// ===========================================
// File Upload Handler (SOW Upload via DM)
// ===========================================
// Catches file uploads in DMs and channels with "upload <project-name>".

app.message(/^upload\s+(.+)/i, async ({ message, context, client, say }) => {
  // Only handle messages with files
  if (!message.files || message.files.length === 0) {
    await say('No file detected. Please attach a SOW file (.txt, .md, or .pdf) along with the upload message.');
    return;
  }
  if (message.subtype && message.subtype !== 'file_share') return;

  const projectName = context.matches[1].trim();
  const file = message.files[0];
  const ext = path.extname(file.name || '').toLowerCase();

  if (!['.txt', '.md', '.pdf'].includes(ext)) {
    await say(`Unsupported file type (\`${ext}\`). Accepted formats: .txt, .md, or .pdf.`);
    return;
  }

  try {
    // Download the file from Slack
    const response = await fetch(file.url_private_download, {
      headers: { Authorization: `Bearer ${config.slack.botToken}` },
    });

    if (!response.ok) {
      await say(`Unable to download file: ${response.statusText}`);
      return;
    }

    let content;
    const sowFilename = `${projectName}.md`;

    if (ext === '.pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = Buffer.from(await response.arrayBuffer());
      const pdfData = await pdfParse(buffer);
      content = pdfData.text;
      console.log(`📄 Parsed PDF: ${file.name} (${content.length} chars)`);
    } else {
      content = await response.text();
      console.log(`📄 Read file: ${file.name} (${content.length} chars)`);
    }

    // Save SOW directly to the database
    await saveSOW(sowFilename, content);

    await say(
      `*SOW uploaded successfully.*\n\n` +
      `*Project:* ${projectName}\n` +
      `*File:* \`${sowFilename}\` (${content.length} characters)\n` +
      `*Source:* ${file.name}\n\n` +
      `To begin monitoring a channel, navigate to the channel and run:\n` +
      `\`/scopeguard setup ${projectName} ${sowFilename}\``
    );

    console.log(`✅ SOW saved to database: ${sowFilename}`);
  } catch (error) {
    console.error('❌ File upload error:', error.message);
    await say(`An error occurred while processing the file: ${error.message}`);
  }
});

// ===========================================
// Passive Message Monitoring
// ===========================================
// Listens to ALL messages in channels where ScopeGuard is invited.
// Runs the Intent Classifier on each message.

app.message(async ({ message, client }) => {
  // Ignore bot messages, edits, deletions
  if (message.subtype) return;
  if (message.bot_id) return;
  if (message.user === botUserId) return;

  // ── Skip messages without text or too short ──
  if (!message.text || message.text.trim().length < 10) return;

  // Check if this channel has a project mapped
  const mapping = await getProjectMapping(message.channel);
  if (!mapping) return; // Not a monitored channel

  // Don't analyze the PM's own messages (the PM is not the client)
  if (message.user === mapping.pm_user_id) return;

  console.log(`👁️  Monitoring message in #${message.channel}: "${message.text.substring(0, 60)}..."`);

  try {
    // Step 1: Intent Classification
    const intent = await classifyIntent(message.text);

    if (!intent.isFeatureRequest || intent.confidence < 0.6) {
      // Not a feature request — ignore
      return;
    }

    console.log(`🎯 Feature request detected (${Math.round(intent.confidence * 100)}%): "${intent.extractedRequest}"`);

    // Step 2: Fetch the SOW
    const sowText = await loadSOW(mapping.sow_filename);
    if (!sowText) {
      console.error(`⚠️  SOW file missing: ${mapping.sow_filename}`);
      return;
    }

    // Step 3: Drift Analysis
    const drift = await analyzeDrift(intent.extractedRequest, sowText, mapping.project_name);

    console.log(`📊 Drift verdict: ${drift.verdict} (${Math.round(drift.confidence * 100)}% confidence)`);

    // For passive monitoring: only alert on drift (OUT_OF_SCOPE or AMBIGUOUS).
    // "No news is good news" — don't bother the PM for in-scope requests.
    if (drift.verdict === 'IN_SCOPE') {
      console.log(`🟢 In scope — no alert needed.`);
      return;
    }

    // Step 4: Generate CR draft (if out of scope or ambiguous)
    const crDraft = await generateCRDraft(drift, intent.extractedRequest, mapping.project_name);

    // Step 5: Send ephemeral alert to the PM
    const blocks =
      drift.verdict === 'IN_SCOPE'
        ? renderInScopeNotice({ intent, drift, projectName: mapping.project_name })
        : renderDriftAlert({
            intent,
            drift,
            crDraft,
            projectName: mapping.project_name,
            originalMessage: message.text,
          });

    await client.chat.postEphemeral({
      channel: message.channel,
      user: mapping.pm_user_id,
      blocks,
      text: `Scope Alert: ${drift.verdict} — "${intent.extractedRequest}"`,
    });

    // Step 6: Save to audit trail
    await saveDriftLog({
      channelId: message.channel,
      projectId: mapping.project_id,
      messageTs: message.ts,
      messageText: message.text,
      userId: message.user,
      intentClassification: JSON.stringify(intent),
      driftVerdict: drift.verdict,
      driftReasoning: drift.reasoning,
      crDraft: crDraft || null,
      sowSectionsReferenced: drift.relevantSowSections,
    });

    console.log(`✅ Alert sent to PM <@${mapping.pm_user_id}>`);
  } catch (error) {
    console.error('❌ Pipeline error:', error.message);
  }
});

// ===========================================
// @ScopeGuard Mention Handler
// ===========================================
// When a PM explicitly mentions @ScopeGuard, run the pipeline
// on the preceding message or provided text.

app.event('app_mention', async ({ event, client }) => {
  const mapping = await getProjectMapping(event.channel);

  if (!mapping) {
    await client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      blocks: renderNoProjectMapped(),
      text: 'No project mapped to this channel.',
    });
    return;
  }

  // Extract text after the mention
  const mentionText = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  if (mentionText.length < 5) {
    await client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      text: 'Please include a specific request to evaluate. Example:\n`@ScopeGuard Can we add a dark mode to the site?`',
    });
    return;
  }

  // Send thinking indicator
  await client.chat.postEphemeral({
    channel: event.channel,
    user: event.user,
    blocks: renderThinking(),
    text: 'Analyzing request...',
  });

  try {
    // Full pipeline
    const intent = { isFeatureRequest: true, confidence: 1.0, extractedRequest: mentionText, reasoning: 'Explicit mention' };
    const sowText = await loadSOW(mapping.sow_filename);
    if (!sowText) {
      await client.chat.postEphemeral({
        channel: event.channel,
        user: event.user,
        text: `The SOW file \`${mapping.sow_filename}\` could not be found. Please re-upload the SOW document.`,
      });
      return;
    }

    const drift = await analyzeDrift(mentionText, sowText, mapping.project_name);
    const crDraft = await generateCRDraft(drift, mentionText, mapping.project_name);

    const blocks =
      drift.verdict === 'IN_SCOPE'
        ? renderInScopeNotice({ intent, drift, projectName: mapping.project_name })
        : renderDriftAlert({
            intent,
            drift,
            crDraft,
            projectName: mapping.project_name,
            originalMessage: mentionText,
          });

    await client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      blocks,
      text: `Scope Alert: ${drift.verdict}`,
    });

    await saveDriftLog({
      channelId: event.channel,
      projectId: mapping.project_id,
      messageTs: event.ts,
      messageText: mentionText,
      userId: event.user,
      intentClassification: JSON.stringify(intent),
      driftVerdict: drift.verdict,
      driftReasoning: drift.reasoning,
      crDraft: crDraft || null,
      sowSectionsReferenced: drift.relevantSowSections,
    });
  } catch (error) {
    console.error('❌ Mention pipeline error:', error.message);
    await client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      text: `An error occurred during analysis: ${error.message}`,
    });
  }
});

// ===========================================
// Pipeline Helper (for /scopeguard check)
// ===========================================

async function runScopeCheckPipeline(client, channelId, userId, textToCheck, respond) {
  const mapping = await getProjectMapping(channelId);

  if (!mapping) {
    await respond({
      response_type: 'ephemeral',
      replace_original: true,
      blocks: renderNoProjectMapped(),
    });
    return;
  }

  try {
    const intent = { isFeatureRequest: true, confidence: 1.0, extractedRequest: textToCheck, reasoning: 'Manual check' };
    const sowText = await loadSOW(mapping.sow_filename);

    if (!sowText) {
      await respond({
        response_type: 'ephemeral',
        replace_original: true,
        text: `The SOW file \`${mapping.sow_filename}\` could not be found. Please re-upload the SOW document.`,
      });
      return;
    }

    const drift = await analyzeDrift(textToCheck, sowText, mapping.project_name);
    const crDraft = await generateCRDraft(drift, textToCheck, mapping.project_name);

    const blocks =
      drift.verdict === 'IN_SCOPE'
        ? renderInScopeNotice({ intent, drift, projectName: mapping.project_name })
        : renderDriftAlert({
            intent,
            drift,
            crDraft,
            projectName: mapping.project_name,
            originalMessage: textToCheck,
          });

    await respond({
      response_type: 'ephemeral',
      replace_original: true,
      blocks,
    });

    await saveDriftLog({
      channelId,
      projectId: mapping.project_id,
      messageTs: Date.now().toString(),
      messageText: textToCheck,
      userId,
      intentClassification: JSON.stringify(intent),
      driftVerdict: drift.verdict,
      driftReasoning: drift.reasoning,
      crDraft: crDraft || null,
      sowSectionsReferenced: drift.relevantSowSections,
    });
  } catch (error) {
    console.error('❌ Check pipeline error:', error.message);
    await respond({
      response_type: 'ephemeral',
      replace_original: true,
      text: `An error occurred during analysis: ${error.message}`,
    });
  }
}

// ===========================================
// Start
// ===========================================

(async () => {
  const authResult = await app.client.auth.test({ token: config.slack.botToken });
  botUserId = authResult.user_id;

  await app.start();

  // Standalone health check server for UptimeRobot (keeps Render from sleeping)
  const http = await import('http');
  const healthPort = process.env.PORT || 3000;
  http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    } else {
      res.writeHead(404);
      res.end();
    }
  }).listen(healthPort, () => {
    console.log(`Health check server listening on port ${healthPort}`);
  });

  console.log(`
  ╔═══════════════════════════════════╗
  ║  🛡️  S C O P E G U A R D         ║
  ║  Scope Drift Detection            ║
  ║  for Slack                        ║
  ╚═══════════════════════════════════╝

  ✅ ScopeGuard is running!
  Bot User ID: ${botUserId}
  
  Commands:
    /scopeguard setup <name> <sow>  — Link channel to project
    /scopeguard check <request>     — Manual scope check
    /scopeguard status              — Show channel project
    @ScopeGuard <request>           — Check scope via mention
  
  Passive monitoring is active on mapped channels.
  MCP server available via: npm run mcp
  `);
})();
