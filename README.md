# 🛡️ ScopeGuard

> **AI-Powered Scope Drift & Creep Detection Agent for Slack**  
> Monitors client channels, evaluates feature requests against your Statement of Work (SOW), and privately alerts the Project Manager with diplomatic Change Request drafts—all without alerting the client.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [How It Works](#-how-it-works)
  - [The 3-Step AI Pipeline](#the-3-step-ai-pipeline)
- [Features](#-features)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
  - [1. Clone & Install Dependencies](#1-clone--install-dependencies)
  - [2. Environment Configuration](#2-environment-configuration)
  - [3. PostgreSQL Database Setup](#3-postgresql-database-setup)
  - [4. Slack App Configuration](#4-slack-app-configuration)
- [Running the Application](#-running-the-application)
- [Usage & Commands](#-usage--commands)
  - [Slack Slash Commands](#slack-slash-commands)
  - [Uploading SOW Documents](#uploading-sow-documents)
  - [Message Context Shortcut](#message-context-shortcut)
  - [Bot Mentions](#bot-mentions)
- [Model Context Protocol (MCP) Server](#-model-context-protocol-mcp-server)
  - [Exposed MCP Tools](#exposed-mcp-tools)
  - [Integrating with MCP Clients](#integrating-with-mcp-clients)
- [Database Schema](#-database-schema)
- [License](#-license)

---

## 📖 Overview

In client-agency, consulting, and freelance engineering workflows, conversations with clients in shared Slack channels often result in subtle or explicit requests for work outside the agreed **Statement of Work (SOW)**. 

Project Managers (PMs) often miss these requests in fast-paced threads or lack the bandwidth to cross-reference contractual deliverables in real-time, resulting in unbilled scope creep, delayed timelines, and margin erosion.

**ScopeGuard** is a passive and on-demand Slack bot that acts as an automated shield for PMs:
1. It listens to channel conversations in the background.
2. Identifies feature requests or scope modifications.
3. Automatically cross-references them against the project's SOW.
4. Delivers private, ephemeral alerts to the PM with an analysis, risk assessment, and a ready-to-send polite Change Request (CR) draft.
5. Operates completely invisibly to clients.

---

## ⚡ How It Works

```
┌─────────────────────────┐
│ Client Message in Slack │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 1. Intent Classifier    │ ──> Not a feature request? (Ignore)
│ (Groq: Llama 3.1 8B)    │
└────────────┬────────────┘
             │ Feature Request Detected (Confidence >= 60%)
             ▼
┌─────────────────────────┐
│ 2. Drift Analyzer       │ <── Loads Project SOW (PostgreSQL / In-Memory Cache)
│ (Groq: Llama 3.1 8B)    │
└────────────┬────────────┘
             │ Verdict: IN_SCOPE | OUT_OF_SCOPE | AMBIGUOUS
             ├──────────────────────────┐
             │ (OUT_OF_SCOPE / AMBIGUOUS)│ (IN_SCOPE)
             ▼                          ▼
┌─────────────────────────┐   ┌───────────────────────────┐
│ 3. CR Generator / Shield│   │ No alert in passive mode  │
│ (Groq: Llama 3.1 8B)    │   │ (Prevents notification    │
└────────────┬────────────┘   │  fatigue for PMs)         │
             │                └───────────────────────────┘
             ▼
┌─────────────────────────────────────────┐
│ Private Ephemeral Block Kit Alert to PM │
│ + Audit Trail Logged to PostgreSQL      │
└─────────────────────────────────────────┘
```

### The 3-Step AI Pipeline

1. **Intent Classifier (`src/scope-engine.js`)**: Evaluates incoming message semantics (`temperature: 0.1`) to identify whether the client is requesting a new deliverable, modification, or additional work versus routine conversation.
2. **Drift Analyzer (`src/scope-engine.js`)**: Compares the extracted feature request against the project's SOW (`temperature: 0.2`). Outputs a structured verdict (`IN_SCOPE`, `OUT_OF_SCOPE`, or `AMBIGUOUS`), confidence score, risk level (`LOW`, `MEDIUM`, `HIGH`), relevant SOW section citations, and estimated effort impact.
3. **Change Request Shield (`src/scope-engine.js`)**: If the request is out-of-scope or ambiguous, the engine drafts a diplomatic, professional 3–5 sentence response (`temperature: 0.6`) acknowledging the client's request positively and proposing a formal change order.

---

## ✨ Features

* 👁️ **Passive Monitoring:** Monitors mapped Slack channels in real-time, automatically ignoring bots, short non-actionable messages (<10 characters), and PM messages.
* 🔒 **100% Client Privacy:** All alerts and checks are delivered via Slack Ephemeral Messages (`chat.postEphemeral`) visible exclusively to the mapped Project Manager.
* 📄 **Multi-Format SOW Ingestion:** Upload SOWs in `.md`, `.txt`, or `.pdf` format directly in Slack. PDF text streams are automatically extracted and indexed.
* 🎯 **On-Demand Scope Checks:** Evaluate scope via right-click message context shortcuts (`Check Scope`), direct `@ScopeGuard` mentions, or slash commands (`/scopeguard check <text>`).
* 📜 **Full Audit Trail:** Every evaluation, classification, reasoning, and CR draft is stored in PostgreSQL for historical review.
* 🔌 **Model Context Protocol (MCP) Integration:** Exposes standalone MCP tools for external AI agents and IDEs (Cursor, Claude Desktop, Antigravity) to query SOWs, project mappings, and drift histories.
* 💓 **Built-in Keep-Alive Server:** Native HTTP server providing a `/healthz` endpoint for uptime monitoring services (e.g. UptimeRobot, Render).

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js (ES Modules) | Application runtime environment |
| **Slack Integration** | `@slack/bolt`, `@slack/web-api` | Socket Mode connection, event handling, Block Kit UI rendering |
| **AI Inference** | `groq-sdk` (`llama-3.1-8b-instant`) | Low-latency LLM inference for the multi-step evaluation pipeline |
| **Database** | PostgreSQL (`pg`), In-memory `Map` Cache | Relational storage for channel mappings, SOW documents, and drift audit logs |
| **Document Processing** | `pdf-parse` | Extraction of text content from uploaded PDF SOW documents |
| **Agent Protocols** | `@modelcontextprotocol/sdk`, `zod` | Standardized tool exposure via Model Context Protocol (stdio) |

---

## 📁 Project Structure

```
ScopeGuard/
├── data/
│   └── sows/                  # Sample SOW markdown documents
│       ├── acme-corp.md
│       ├── brightpath.md
│       └── starter-app.md
├── src/
│   ├── blocks.js              # Slack Block Kit UI template generators
│   ├── config.js              # Environment variable assertion and config loader
│   ├── database.js            # PostgreSQL connection pool, schema DDL, and CRUD queries
│   ├── index.js               # Application entry point, Slack event handlers, and HTTP health check
│   ├── mcp-server.js          # Standalone Model Context Protocol (MCP) server
│   ├── scope-engine.js        # 3-step LLM analysis pipeline via Groq SDK
│   └── sow-manager.js         # SOW retrieval, cache management, and storage abstraction
├── .env.example               # Example environment variable template
├── manifest.yml               # Slack App Manifest (scopes, events, commands, shortcuts)
├── package.json               # Node.js project metadata and dependencies
└── README.md                  # Project documentation
```

---

## 🚀 Installation & Setup

### 1. Clone & Install Dependencies

```bash
# Clone repository
git clone https://github.com/GitSuman0699/ScopeGuard.git
cd ScopeGuard

# Install dependencies
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure the following variables in `.env`:

```ini
# Slack Bot Token (OAuth & Permissions -> Bot User OAuth Token)
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Slack App-Level Token (Basic Information -> App-Level Tokens -> with connections:write scope)
SLACK_APP_TOKEN=xapp-your-app-token

# Groq API Key (https://console.groq.com/keys)
GROQ_API_KEY=gsk_your_groq_api_key

# Groq Model (default: llama-3.1-8b-instant)
GROQ_MODEL=llama-3.1-8b-instant

# PostgreSQL Database Connection URL (e.g., Supabase, Neon, Railway, Local)
DATABASE_URL=postgresql://username:password@hostname:5432/databasename

# Optional: Health check server port (default: 3000)
PORT=3000
```

### 3. PostgreSQL Database Setup

ScopeGuard automatically runs idempotent DDL queries on startup (`initDatabase()`), creating all necessary tables (`project_mappings`, `drift_logs`, `sows`) automatically. Ensure your PostgreSQL database is reachable via `DATABASE_URL`.

### 4. Slack App Configuration

1. Visit [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From an app manifest**.
2. Select your workspace and copy the contents of [`manifest.yml`](manifest.yml) into the YAML editor.
3. In **Settings > Socket Mode**, ensure Socket Mode is **Enabled**.
4. In **Settings > Basic Information > App-Level Tokens**, generate a token with the `connections:write` scope (copy to `SLACK_APP_TOKEN`).
5. In **Settings > Install App**, install the app to your workspace and copy the **Bot User OAuth Token** (copy to `SLACK_BOT_TOKEN`).

---

## 🏃 Running the Application

### Start Slack Bot in Development Mode
```bash
npm run dev
```

### Start Slack Bot in Production Mode
```bash
npm start
```

### Start Standalone MCP Server
```bash
npm run mcp
```

---

## 💬 Usage & Commands

### Slack Slash Commands

All commands are executed via `/scopeguard`:

| Command | Description |
| :--- | :--- |
| `/scopeguard setup <project-name> <sow-filename>` | Links current channel to a project SOW and designates the caller as the channel PM. |
| `/scopeguard check <request-text>` | Manually evaluates a request string against the channel SOW. |
| `/scopeguard status` | Displays active project name, linked SOW file, and assigned PM for the channel. |
| `/scopeguard projects` | Lists all configured projects across the workspace. |
| `/scopeguard upload <project-name>` | Displays upload instructions for uploading SOW files. |
| `/scopeguard reassign <@user>` | Reassigns the Project Manager who receives ephemeral alerts for the channel. |
| `/scopeguard remove` | Unlinks the project from the current channel and halts monitoring. |
| `/scopeguard help` | Displays the help menu. |

### Uploading SOW Documents

To upload a new SOW directly through Slack:
1. Open a direct message (DM) with **ScopeGuard** or navigate to any channel where ScopeGuard is present.
2. Send a message formatted as: `upload <project-name>` (e.g. `upload acme-corp`).
3. Attach the SOW document (`.pdf`, `.md`, or `.txt`) to that message and send.
4. ScopeGuard parses the document (extracting text from PDFs) and stores it in PostgreSQL.
5. Map the uploaded SOW to a channel using `/scopeguard setup acme-corp acme-corp.md`.

### Message Context Shortcut

1. Hover over any message from a client in a monitored channel.
2. Click **More actions** (the three dots `⋮`).
3. Select **Check Scope**.
4. ScopeGuard evaluates the message and displays the result privately to you as an ephemeral message.

### Bot Mentions

PMs can invoke an instant evaluation by mentioning the bot in a mapped channel:
```
@ScopeGuard Can we add multi-currency Stripe checkout and subscriptions?
```

---

## 🔌 Model Context Protocol (MCP) Server

ScopeGuard implements the open standard [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) via `@modelcontextprotocol/sdk`, enabling external AI tools (Claude Desktop, Cursor, Antigravity) to query SOWs and project drift histories.

### Exposed MCP Tools

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `fetch_project_sow` | `sowFilename: string` | Fetches the full raw text content of a Statement of Work. |
| `list_available_sows` | *none* | Lists all SOW documents available in storage. |
| `get_channel_project` | `channelId: string` | Retrieves the project and PM mapping for a specific Slack channel ID. |
| `get_drift_history` | `projectId: string`, `limit?: number` | Fetches recent drift evaluations and reasoning for a specific project. |
| `list_all_projects` | *none* | Returns a list of all configured projects and their associated channels. |

### Integrating with MCP Clients

Add ScopeGuard to your MCP client configuration (e.g. `claude_desktop_config.json` or `mcp_config.json`):

```json
{
  "mcpServers": {
    "scopeguard": {
      "command": "node",
      "args": ["/absolute/path/to/ScopeGuard/src/mcp-server.js"],
      "env": {
        "DATABASE_URL": "postgresql://username:password@hostname:5432/databasename"
      }
    }
  }
}
```

---

## 🗄️ Database Schema

ScopeGuard uses three relational tables in PostgreSQL:

```sql
-- Maps Slack channels to specific SOW projects and PMs
CREATE TABLE IF NOT EXISTS project_mappings (
  channel_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  sow_filename TEXT NOT NULL,
  pm_user_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for every drift evaluation performed
CREATE TABLE IF NOT EXISTS drift_logs (
  id SERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  message_ts TEXT NOT NULL,
  message_text TEXT NOT NULL,
  user_id TEXT NOT NULL,
  intent_classification TEXT,       -- Serialized JSON
  drift_verdict TEXT,               -- 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'AMBIGUOUS'
  drift_reasoning TEXT,
  cr_draft TEXT,
  sow_sections_referenced TEXT,     -- Serialized JSON array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SOW document repository
CREATE TABLE IF NOT EXISTS sows (
  filename TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
