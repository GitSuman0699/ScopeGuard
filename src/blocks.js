// ===========================================
// ScopeGuard — Block Kit UI (Ephemeral Alerts)
// ===========================================
// Renders Block Kit messages that are sent
// only to the PM as ephemeral messages (invisible to client).

/**
 * Render a "thinking" indicator while the pipeline runs.
 */
export function renderThinking() {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*ScopeGuard* is analyzing this request against the project SOW...',
      },
    },
  ];
}

/**
 * Render the full drift analysis result for the PM.
 *
 * @param {Object} options
 * @param {Object} options.intent - Intent classification result
 * @param {Object} options.drift - Drift analysis result
 * @param {string|null} options.crDraft - Generated CR draft (null if in-scope)
 * @param {string} options.projectName - The project name
 * @param {string} options.originalMessage - The original client message
 */
export function renderDriftAlert({ intent, drift, crDraft, projectName, originalMessage }) {
  const verdictLabel =
    drift.verdict === 'IN_SCOPE'
      ? 'In Scope'
      : drift.verdict === 'OUT_OF_SCOPE'
        ? 'Out of Scope'
        : 'Ambiguous';

  const riskLabel = drift.riskLevel || 'N/A';

  const blocks = [
    // Header
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Scope Alert: ${verdictLabel}`,
        emoji: false,
      },
    },

    // Project & Confidence
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Project:*\n${projectName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Confidence:*\n${Math.round(drift.confidence * 100)}%`,
        },
        {
          type: 'mrkdwn',
          text: `*Risk Level:*\n${riskLabel}`,
        },
      ],
    },

    { type: 'divider' },

    // Detected Request
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Detected Request:*\n> ${intent.extractedRequest}`,
      },
    },

    // AI Reasoning
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Analysis:*\n${drift.reasoning}`,
      },
    },
  ];

  // SOW Sections Referenced
  if (drift.relevantSowSections && drift.relevantSowSections.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*SOW Sections Referenced:*\n${drift.relevantSowSections.map((s) => `- ${s}`).join('\n')}`,
      },
    });
  }

  // Estimated Impact
  if (drift.estimatedImpact) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Estimated Impact:*\n${drift.estimatedImpact}`,
      },
    });
  }

  // CR Draft (only for OUT_OF_SCOPE or AMBIGUOUS)
  if (crDraft) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Suggested Response (copy and modify as needed):*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`${crDraft}\`\`\``,
        },
      }
    );
  }

  // Footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '_This alert is only visible to you. The client cannot see it._',
      },
    ],
  });

  return blocks;
}

/**
 * Render an in-scope confirmation (lighter, less intrusive).
 */
export function renderInScopeNotice({ intent, drift, projectName }) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*In Scope* — "${intent.extractedRequest}" is covered by the *${projectName}* SOW.\n_${drift.reasoning}_`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '_This alert is only visible to you._',
        },
      ],
    },
  ];
}

/**
 * Render setup instructions when no project is mapped to the channel.
 */
export function renderNoProjectMapped() {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*No project is mapped to this channel.*\n\nRun `/scopeguard setup <project-name> <sow-file>` to link a project SOW.',
      },
    },
  ];
}

/**
 * Render setup success confirmation.
 */
export function renderSetupSuccess(projectName, sowFilename) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Channel linked to project "${projectName}"*\nSOW file: \`${sowFilename}\`\n\nScopeGuard will now monitor messages in this channel for scope drift.`,
      },
    },
  ];
}
