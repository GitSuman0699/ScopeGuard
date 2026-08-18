// ===========================================
// ScopeGuard — Configuration
// ===========================================

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  },

  databaseUrl: process.env.DATABASE_URL,
};

/**
 * Validate that all required environment variables are set.
 */
export function validateConfig() {
  const missing = [];
  if (!config.slack.botToken) missing.push('SLACK_BOT_TOKEN');
  if (!config.slack.appToken) missing.push('SLACK_APP_TOKEN');
  if (!config.groq.apiKey) missing.push('GROQ_API_KEY');
  if (!config.databaseUrl) missing.push('DATABASE_URL');

  if (missing.length > 0) {
    console.error(`\n❌ Missing required environment variables:\n   ${missing.join(', ')}\n`);
    console.error('   Please provide a PostgreSQL connection string in DATABASE_URL.\n');
    process.exit(1);
  }
}
