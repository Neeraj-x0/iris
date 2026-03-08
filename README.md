# iris-relay

Lightweight Telegram relay dev tool — crash alerts, deploy notifications, heartbeats, and more. Zero-config, tree-shakeable, built-in `.env` loading.

## Install

```bash
pnpm add iris-relay
```

## Setup

Create a `.env` file in your project root:

```env
XERO_BOT_TOKEN=your_bot_token_from_botfather
XERO_CHAT_ID=your_telegram_chat_id
XERO_DRY_RUN=false
```

> **Bot Token** → [@BotFather](https://t.me/BotFather) · **Chat ID** → [@userinfobot](https://t.me/userinfobot)

No dotenv import needed — `iris-relay` auto-loads your `.env`.

---

## Quick Start

```ts
import { relay } from "iris-relay";

await relay("Hello from my server! 🚀");
```

---

## Features

### 📨 Core Relay

```ts
import { relay, createRelay } from "iris-relay";

// One-off message
await relay("Server started");

// With options
await relay("Check this out", {
  parseMode: "HTML",
  disablePreview: true,
  silent: true,
  retries: 3,          // retry with exponential backoff
  retryDelay: 1000,    // base delay in ms
});

// Pre-configured sender
const send = createRelay({ botToken: "...", chatId: "..." });
await send("Deploy successful ✅");
```

### 🚨 Error Relay

```ts
import { relayError } from "iris-relay";

try {
  dangerousOperation();
} catch (err) {
  await relayError(err); // sends formatted stack trace
}
```

### 📋 JSON Relay

```ts
import { relayJSON } from "iris-relay";

await relayJSON({ users: 42, status: "healthy" }, "Server Stats");
```

### 🚀 Deploy Notifications

Sends a formatted deploy summary to Telegram. **Git info is auto-detected** — no config needed if you're in a git repo.

```ts
import { relayDeploy } from "iris-relay";

// Minimal — auto-reads git branch, commit hash, and commit message
await relayDeploy();

// With app info
await relayDeploy({ app: "my-api", env: "production", version: "1.2.3" });

// Full example
await relayDeploy({
  app: "my-api",
  env: "production",
  version: "1.2.3",
  by: "CI/CD Pipeline",
  extra: { region: "us-east-1", duration: "45s" },
});
```

**Example Telegram output:**
```
🚀 Deploy Notification

📦 App: my-api
🌍 Env: production
🏷️ Version: 1.2.3
🌿 Branch: main
📝 Commit: a1b2c3d — fix: resolve login bug
👤 By: CI/CD Pipeline
⏰ Time: 2026-03-08T12:00:00.000Z
• region: us-east-1
• duration: 45s
```

**How auto-detection works:**

| Field | Git command | Example output |
|-------|-------------|---------------|
| `branch` | `git rev-parse --abbrev-ref HEAD` | `main` |
| `commit` | `git rev-parse --short HEAD` | `a1b2c3d` |
| Commit message | `git log -1 --pretty=%s` | `fix: resolve login bug` |

> All auto-detected values can be overridden by passing them in the `meta` object. If git is not installed or you're not in a repo, those fields are silently omitted.

**CI/CD example (GitHub Actions):**
```ts
await relayDeploy({
  app: "my-api",
  env: "production",
  version: process.env.npm_package_version,
  by: `GitHub Actions (${process.env.GITHUB_ACTOR})`,
  commit: process.env.GITHUB_SHA?.slice(0, 7),
  branch: process.env.GITHUB_REF_NAME,
});
```

### ✍️ Message Builder

```ts
import { message } from "iris-relay";

await message()
  .bold("Deploy")
  .text(" ")
  .code("v1.2.3")
  .text(" to ")
  .italic("production")
  .br()
  .separator()
  .link("View Dashboard", "https://example.com")
  .send();
```

Builder methods: `.bold()` `.italic()` `.code()` `.codeBlock()` `.strike()` `.underline()` `.link()` `.text()` `.br()` `.separator()`

### 📎 File Relay

```ts
import { relayFile } from "iris-relay";

await relayFile("./logs/error.log", "Latest error log");
```

### 💀 Process Crash Watcher

```ts
import { watchProcess } from "iris-relay";

watchProcess(); // done — uncaught exceptions & rejections get reported
```

### 💓 Heartbeat

```ts
import { startHeartbeat } from "iris-relay";

const stop = startHeartbeat({
  interval: 60_000,   // every minute
  app: "my-api",
});

// Later: stop();
```

### 🔌 Express Middleware

```ts
import express from "express";
import { irisMiddleware, irisErrorHandler } from "iris-relay";

const app = express();

// Reports slow requests (>3s) and 5xx errors
app.use(irisMiddleware({ slowThreshold: 3000 }));

// Your routes...

// Catches unhandled errors and sends to Telegram
app.use(irisErrorHandler());
```

### 📡 Multi-Channel

```ts
import { createChannels } from "iris-relay";

const channels = createChannels([
  { name: "alerts", chatId: "-100123456" },
  { name: "deploys", chatId: "-100789012", silent: true },
  { name: "logs", chatId: "-100345678" },
]);

await channels.send("alerts", "🚨 Server is down!");
await channels.send("deploys", "🚀 v1.2.3 deployed");
await channels.broadcast("System maintenance in 5 minutes");
```

### 🧪 Dry Run Mode

Set `XERO_DRY_RUN=true` in `.env` to log messages to console instead of sending to Telegram. Perfect for local development.

---

## Getting Started

```bash
npx iris-relay init
```

The setup wizard will:
1. Ask for your **Bot Token** (from @BotFather)
2. Ask for your **Chat ID** (from @userinfobot)
3. Optionally enable **dry run mode**
4. Optionally generate a **GitHub Actions workflow**
5. Write your `.env` and add it to `.gitignore`
6. Send a **test message** to verify everything works

---

## CLI

```bash
# Interactive setup
npx iris-relay init

# Send a message
npx iris-relay "Deploy complete ✅"

# Send with HTML
npx iris-relay --html "<b>Bold</b> message"

# Send a file
npx iris-relay --file ./logs/error.log "Error log attached"

# Silent (no notification sound)
npx iris-relay --silent "Background update"
```

---

## API Reference

| Export | Description |
|--------|-------------|
| `relay(msg, config?)` | Send a text message |
| `createRelay(config)` | Create a pre-configured sender |
| `relayError(err, config?)` | Send formatted error + stack trace |
| `relayJSON(obj, label?, config?)` | Send pretty-printed JSON |
| `relayDeploy(meta?, config?)` | Send deploy notification with git info |
| `relayFile(path, caption?, config?)` | Send a file |
| `message()` | Create a fluent message builder |
| `watchProcess(config?)` | Auto-report crashes |
| `startHeartbeat(opts?, config?)` | Periodic alive pings |
| `irisMiddleware(opts?)` | Express middleware for slow/error reporting |
| `irisErrorHandler(config?)` | Express error handler |
| `createChannels(channels, config?)` | Multi-channel manager |
| `isDryRun()` | Check if dry run mode is active |

## Config

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `botToken` | `string` | `XERO_BOT_TOKEN` | Bot token |
| `chatId` | `string` | `XERO_CHAT_ID` | Chat ID |
| `parseMode` | `"HTML" \| "Markdown" \| "MarkdownV2"` | — | Message format |
| `disablePreview` | `boolean` | `false` | Disable link previews |
| `silent` | `boolean` | `false` | No notification sound |
| `retries` | `number` | `0` | Retry count |
| `retryDelay` | `number` | `1000` | Base retry delay (ms) |

## Requirements

- Node.js ≥ 18

## License

MIT
