// ===========================================
// ScopeGuard — Scope Engine (Multi-Step AI Pipeline)
// ===========================================
// Step 1: Intent Classifier — Is this a feature request?
// Step 2: Drift Analyzer  — Does it fall within the SOW?
// Step 3: Shield (CR Gen) — Draft a polite Change Request.

import Groq from 'groq-sdk';
import { config } from './config.js';

let groq;

/**
 * Initialize the Groq client.
 */
export function initScopeEngine() {
  groq = new Groq({ apiKey: config.groq.apiKey });
  console.log(`✅ Scope engine initialized (model: ${config.groq.model})`);
}

// ─── Step 1: Intent Classifier ─────────────────────────

/**
 * Classify whether a message is a feature request, scope change,
 * or just normal conversation.
 *
 * @param {string} messageText - The raw Slack message text
 * @returns {Promise<{ isFeatureRequest: boolean, confidence: number, extractedRequest: string, reasoning: string }>}
 */
export async function classifyIntent(messageText) {
  const response = await groq.chat.completions.create({
    model: config.groq.model,
    messages: [
      {
        role: 'system',
        content: `You are an intent classifier for a project management tool. Your job is to determine whether a client message is requesting a NEW feature, a change in scope, or additional work that may not be covered by the original agreement.

Respond ONLY with valid JSON, no markdown fences. Use this exact format:
{
  "isFeatureRequest": true/false,
  "confidence": 0.0 to 1.0,
  "extractedRequest": "A clear one-line summary of what the client is asking for",
  "reasoning": "Brief explanation of why you classified it this way"
}

Examples of feature requests:
- "Can we also add a dark mode?"
- "We need a user login portal"
- "What about adding PDF export?"
- "Could you integrate with Stripe for payments?"
- "We want to add a chatbot to the site"

Examples of NOT feature requests (normal conversation):
- "The button color looks great!"
- "When is the next delivery?"
- "Can we schedule a call?"
- "Thanks for the update"
- "I reviewed the designs, looks good"`,
      },
      {
        role: 'user',
        content: `Classify this message:\n"${messageText}"`,
      },
    ],
    temperature: 0.1,
    max_tokens: 300,
  });

  try {
    const text = response.choices[0]?.message?.content || '{}';
    // Strip markdown fences if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('⚠️  Intent classification parse error:', e.message);
    return { isFeatureRequest: false, confidence: 0, extractedRequest: '', reasoning: 'Parse error' };
  }
}

// ─── Step 2: Drift Analyzer ────────────────────────────

/**
 * Compare a detected feature request against the SOW to determine drift.
 *
 * @param {string} featureRequest - The extracted feature request text
 * @param {string} sowText - The full SOW document content
 * @param {string} projectName - Name of the project for context
 * @returns {Promise<{ verdict: string, confidence: number, reasoning: string, relevantSowSections: string[], riskLevel: string }>}
 */
export async function analyzeDrift(featureRequest, sowText, projectName) {
  const response = await groq.chat.completions.create({
    model: config.groq.model,
    messages: [
      {
        role: 'system',
        content: `You are a scope drift analyzer for project management. You will be given a client's feature request and the original Statement of Work (SOW) for the project.

Your job is to carefully compare the request against the SOW deliverables and determine if the request is:
- "IN_SCOPE" — The SOW explicitly covers this or it is a reasonable sub-task of an agreed deliverable.
- "OUT_OF_SCOPE" — The SOW does NOT cover this. It is new work beyond the agreement.
- "AMBIGUOUS" — The SOW is vague enough that this could be argued either way. Needs PM judgment.

Respond ONLY with valid JSON, no markdown fences:
{
  "verdict": "IN_SCOPE" | "OUT_OF_SCOPE" | "AMBIGUOUS",
  "confidence": 0.0 to 1.0,
  "reasoning": "Detailed explanation referencing specific SOW sections",
  "relevantSowSections": ["Section names or quotes from the SOW that are relevant"],
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "estimatedImpact": "Brief note on what this would add in terms of effort/cost"
}`,
      },
      {
        role: 'user',
        content: `PROJECT: ${projectName}

FEATURE REQUEST:
"${featureRequest}"

STATEMENT OF WORK:
${sowText}

Analyze whether this feature request falls within or outside the scope defined in the SOW.`,
      },
    ],
    temperature: 0.2,
    max_tokens: 800,
  });

  try {
    const text = response.choices[0]?.message?.content || '{}';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('⚠️  Drift analysis parse error:', e.message);
    return {
      verdict: 'AMBIGUOUS',
      confidence: 0,
      reasoning: 'Unable to parse AI response',
      relevantSowSections: [],
      riskLevel: 'MEDIUM',
      estimatedImpact: 'Unknown',
    };
  }
}

// ─── Step 3: Shield — CR Generator ─────────────────────

/**
 * Generate a professional Change Request draft for the PM.
 *
 * @param {Object} driftResult - Output from analyzeDrift()
 * @param {string} featureRequest - The original feature request
 * @param {string} projectName - The project name
 * @returns {Promise<string>} The CR draft text
 */
export async function generateCRDraft(driftResult, featureRequest, projectName) {
  // Only generate CR for out-of-scope or ambiguous verdicts
  if (driftResult.verdict === 'IN_SCOPE') {
    return null;
  }

  const response = await groq.chat.completions.create({
    model: config.groq.model,
    messages: [
      {
        role: 'system',
        content: `You are a professional project manager drafting a polite, diplomatic response to a client who has requested something outside the original scope of work.

Write a brief, professional message (3-5 sentences max) that:
1. Acknowledges the client's request positively
2. Explains that it falls outside the current scope
3. Offers to create a formal change request / addendum
4. Keeps the tone warm and collaborative — never defensive or confrontational

Do NOT use markdown formatting. Write plain text only. Do not add a subject line. Just write the message body.`,
      },
      {
        role: 'user',
        content: `Project: ${projectName}
Client requested: "${featureRequest}"
Verdict: ${driftResult.verdict}
Reasoning: ${driftResult.reasoning}

Draft a professional response.`,
      },
    ],
    temperature: 0.6,
    max_tokens: 400,
  });

  return response.choices[0]?.message?.content || 'Unable to generate draft response.';
}
