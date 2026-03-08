#!/usr/bin/env node

import { config } from "dotenv";
import { relay } from "./relay.js";
import { relayFile } from "./file.js";
import { createInterface } from "node:readline/promises";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

config({ quiet: true });

const args = process.argv.slice(2);

function printHelp() {
    console.log(`
iris-relay — Telegram message relay for developers

Commands:
  iris-relay init              Interactive setup wizard
  iris-relay "message"         Send a text message
  iris-relay --file <path>     Send a file

Options:
  --silent         Send without notification sound
  --html           Parse message as HTML
  --markdown       Parse message as Markdown
  --help, -h       Show this help message

Environment:
  XERO_BOT_TOKEN   Your Telegram bot token
  XERO_CHAT_ID     Your Telegram chat ID
  XERO_DRY_RUN     Set to "true" to log instead of send
`);
}

// ─── Helpers ─────────────────────────────────────────────────

function yn(answer: string): boolean {
    return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

function detectPackageManager(): string {
    if (existsSync(join(process.cwd(), "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(process.cwd(), "yarn.lock"))) return "yarn";
    if (existsSync(join(process.cwd(), "bun.lockb"))) return "bun";
    return "npm";
}

function detectFramework(): string | null {
    const pkgPath = join(process.cwd(), "package.json");
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (allDeps["next"]) return "next";
    if (allDeps["express"]) return "express";
    if (allDeps["fastify"]) return "fastify";
    if (allDeps["hono"]) return "hono";
    if (allDeps["koa"]) return "koa";
    return null;
}

// ─── Interactive Setup ───────────────────────────────────────

async function runInit() {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const pm = detectPackageManager();
    const framework = detectFramework();

    console.log(`
╔══════════════════════════════════════════╗
║        🛰️  iris-relay setup wizard       ║
╚══════════════════════════════════════════╝
`);

    if (framework) console.log(`  Detected: ${framework} project (${pm})\n`);

    // ── Step 1: Credentials ──────────────────────

    console.log("Step 1 — Telegram Credentials\n");
    console.log("  Get bot token → https://t.me/BotFather");
    console.log("  Get chat ID   → https://t.me/userinfobot\n");

    const botToken = (await rl.question("  XERO_BOT_TOKEN: ")).trim();
    if (!botToken) {
        console.error("\n❌ Bot token is required.");
        rl.close();
        process.exit(1);
    }

    const chatId = (await rl.question("  XERO_CHAT_ID: ")).trim();
    if (!chatId) {
        console.error("\n❌ Chat ID is required.");
        rl.close();
        process.exit(1);
    }

    // ── Step 2: Features ─────────────────────────

    console.log("\nStep 2 — Features to enable\n");

    const enableCrashWatch = yn(
        await rl.question("  🛡️  Auto-report crashes to Telegram? (Y/n): ") || "y"
    );

    const enableHeartbeat = yn(
        await rl.question("  💓 Send periodic heartbeat pings? (y/N): ")
    );

    let heartbeatInterval = 60;
    let appName = "";
    if (enableHeartbeat) {
        appName = (await rl.question("     App name (for heartbeat label): ")).trim() || "My App";
        const intervalStr = (await rl.question("     Interval in seconds (default: 60): ")).trim();
        heartbeatInterval = parseInt(intervalStr) || 60;
    }

    const enableMiddleware = framework === "express" || framework === "fastify" || framework === "koa"
        ? yn(await rl.question(`  🔌 Add ${framework} error/slow-request middleware? (Y/n): `) || "y")
        : false;

    const enableDryRun = yn(
        await rl.question("  🧪 Enable dry run mode for now? (y/N): ")
    );

    // ── Step 3: Scaffolding ──────────────────────

    console.log("\nStep 3 — Project scaffolding\n");

    const generateStarter = yn(
        await rl.question("  📄 Generate a starter file (iris.ts / iris.js)? (Y/n): ") || "y"
    );

    const generateCI = yn(
        await rl.question("  🚀 Generate GitHub Actions deploy notification? (y/N): ")
    );

    const generateDocker = yn(
        await rl.question("  🐳 Add XERO_ env vars to docker-compose.yml? (y/N): ")
    );

    rl.close();

    // ── Write .env ───────────────────────────────

    console.log("\n── Writing files ──\n");

    const envPath = join(process.cwd(), ".env");
    let envContent = "";

    if (existsSync(envPath)) {
        const existing = readFileSync(envPath, "utf-8");
        envContent = existing
            .split("\n")
            .filter((line) =>
                !line.startsWith("XERO_BOT_TOKEN=") &&
                !line.startsWith("XERO_CHAT_ID=") &&
                !line.startsWith("XERO_DRY_RUN=")
            )
            .join("\n")
            .trimEnd();
        if (envContent) envContent += "\n\n";
    }

    envContent += `# iris-relay config\n`;
    envContent += `XERO_BOT_TOKEN=${botToken}\n`;
    envContent += `XERO_CHAT_ID=${chatId}\n`;
    if (enableDryRun) {
        envContent += `XERO_DRY_RUN=true\n`;
    }

    writeFileSync(envPath, envContent);
    console.log(`✅ .env → ${envPath}`);

    // ── .gitignore ───────────────────────────────

    const gitignorePath = join(process.cwd(), ".gitignore");
    if (existsSync(gitignorePath)) {
        const gitignore = readFileSync(gitignorePath, "utf-8");
        if (!gitignore.includes(".env")) {
            writeFileSync(gitignorePath, gitignore.trimEnd() + "\n.env\n");
            console.log("✅ .env added to .gitignore");
        }
    } else {
        writeFileSync(gitignorePath, "node_modules\n.env\n");
        console.log("✅ .gitignore created");
    }

    // ── Starter file ─────────────────────────────

    if (generateStarter) {
        const isTS = existsSync(join(process.cwd(), "tsconfig.json"));
        const ext = isTS ? "ts" : "js";
        const starterPath = join(process.cwd(), `iris.${ext}`);

        let starter = "";

        if (isTS) {
            starter += `import { relay, relayError, relayDeploy } from "iris-relay";\n`;
        } else {
            starter += `const { relay, relayError, relayDeploy } = require("iris-relay");\n`;
        }

        starter += `\n`;

        if (enableCrashWatch) {
            if (isTS) {
                starter += `import { watchProcess } from "iris-relay";\n`;
            } else {
                starter += `const { watchProcess } = require("iris-relay");\n`;
            }
            starter += `\n// Auto-report uncaught exceptions & unhandled rejections\n`;
            starter += `watchProcess();\n\n`;
        }

        if (enableHeartbeat) {
            if (isTS) {
                starter += `import { startHeartbeat } from "iris-relay";\n`;
            } else {
                starter += `const { startHeartbeat } = require("iris-relay");\n`;
            }
            starter += `\n// Send periodic heartbeat (every ${heartbeatInterval}s)\n`;
            starter += `const stopHeartbeat = startHeartbeat({\n`;
            starter += `  interval: ${heartbeatInterval * 1000},\n`;
            starter += `  app: "${appName}",\n`;
            starter += `});\n\n`;
        }

        if (enableMiddleware && framework === "express") {
            if (isTS) {
                starter += `import { irisMiddleware, irisErrorHandler } from "iris-relay";\n`;
            } else {
                starter += `const { irisMiddleware, irisErrorHandler } = require("iris-relay");\n`;
            }
            starter += `\n// Add to your Express app:\n`;
            starter += `// app.use(irisMiddleware({ slowThreshold: 3000 }));\n`;
            starter += `// app.use(irisErrorHandler()); // after all routes\n\n`;
        }

        starter += `// ── Examples ──\n\n`;
        starter += `// Send a message\n`;
        starter += `// await relay("Server started 🚀");\n\n`;
        starter += `// Report an error\n`;
        starter += `// try { ... } catch (err) { await relayError(err); }\n\n`;
        starter += `// Deploy notification (auto-reads git info)\n`;
        starter += `// await relayDeploy({ app: "${appName || "my-app"}", env: "production" });\n`;

        writeFileSync(starterPath, starter);
        console.log(`✅ iris.${ext} → ${starterPath}`);
    }

    // ── GitHub Actions ───────────────────────────

    if (generateCI) {
        const workflowDir = join(process.cwd(), ".github", "workflows");
        const workflowPath = join(workflowDir, "iris-notify.yml");

        const workflowContent = `# iris-relay deploy notification
# Add XERO_BOT_TOKEN and XERO_CHAT_ID as repository secrets

name: Deploy Notification

on:
  push:
    branches: [main]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - run: ${pm} install iris-relay

      - name: Send deploy notification
        env:
          XERO_BOT_TOKEN: \${{ secrets.XERO_BOT_TOKEN }}
          XERO_CHAT_ID: \${{ secrets.XERO_CHAT_ID }}
        run: npx iris-relay "🚀 Deployed \${{ github.repository }}@\${{ github.sha }}"
`;

        mkdirSync(workflowDir, { recursive: true });
        writeFileSync(workflowPath, workflowContent);
        console.log(`✅ GitHub Actions → ${workflowPath}`);
        console.log("   ⚠️  Add XERO_BOT_TOKEN and XERO_CHAT_ID as repo secrets!");
    }

    // ── Docker Compose ───────────────────────────

    if (generateDocker) {
        const composePath = join(process.cwd(), "docker-compose.yml");

        if (existsSync(composePath)) {
            const existing = readFileSync(composePath, "utf-8");
            if (!existing.includes("XERO_BOT_TOKEN")) {
                const envBlock = `\n    # iris-relay\n    environment:\n      - XERO_BOT_TOKEN=\${XERO_BOT_TOKEN}\n      - XERO_CHAT_ID=\${XERO_CHAT_ID}\n`;
                console.log(`\n📋 Add this to your service in docker-compose.yml:\n${envBlock}`);
            }
        } else {
            const composeContent = `version: "3.8"

services:
  app:
    build: .
    env_file:
      - .env
    environment:
      - XERO_BOT_TOKEN=\${XERO_BOT_TOKEN}
      - XERO_CHAT_ID=\${XERO_CHAT_ID}
`;
            writeFileSync(composePath, composeContent);
            console.log(`✅ docker-compose.yml → ${composePath}`);
        }
    }

    // ── Test connection ──────────────────────────

    console.log("\n🧪 Testing connection...");
    process.env.XERO_BOT_TOKEN = botToken;
    process.env.XERO_CHAT_ID = chatId;

    const result = await relay("✅ iris-relay connected successfully!");
    if (result.success) {
        console.log("✅ Test message sent! Check your Telegram.");
    } else {
        console.error(`⚠️  Test failed: ${result.error}`);
        console.log("   .env was still saved — double-check your token and chat ID.");
    }

    // ── Summary ──────────────────────────────────

    const features = [];
    if (enableCrashWatch) features.push("crash watcher");
    if (enableHeartbeat) features.push(`heartbeat (${heartbeatInterval}s)`);
    if (enableMiddleware) features.push(`${framework} middleware`);
    if (enableDryRun) features.push("dry run mode");

    console.log(`
╔══════════════════════════════════════════╗
║          🎉  Setup complete!             ║
╚══════════════════════════════════════════╝

  Features: ${features.length > 0 ? features.join(", ") : "core only"}

  Quick start:
    import { relay } from "iris-relay";
    await relay("Hello from my server! 🚀");

  CLI:
    npx iris-relay "Quick message"
`);
}

// ─── Message / File Sending ──────────────────────────────────

async function main() {
    const command = args[0];

    if (command === "init") {
        await runInit();
        return;
    }

    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
        printHelp();
        process.exit(0);
    }

    const silent = args.includes("--silent");
    const html = args.includes("--html");
    const markdown = args.includes("--markdown");
    const fileIdx = args.indexOf("--file");

    const messageArgs = args.filter(
        (a, i) => !a.startsWith("--") && !(i === fileIdx + 1 && fileIdx >= 0)
    );
    const message = messageArgs.join(" ");

    const parseMode = html ? "HTML" as const : markdown ? "Markdown" as const : undefined;

    try {
        if (fileIdx >= 0) {
            const filePath = args[fileIdx + 1];
            if (!filePath) {
                console.error("Error: --file requires a path argument");
                process.exit(1);
            }

            const result = await relayFile(filePath, message || undefined, {
                silent,
                parseMode,
            });

            if (result.success) {
                console.log(`✅ File sent: ${filePath}`);
            } else {
                console.error(`❌ Failed: ${result.error}`);
                process.exit(1);
            }
            return;
        }

        if (!message) {
            console.error("Error: No message provided");
            printHelp();
            process.exit(1);
        }

        const result = await relay(message, { silent, parseMode });

        if (result.success) {
            console.log(`✅ Message sent (ID: ${result.messageId})`);
        } else {
            console.error(`❌ Failed: ${result.error}`);
            process.exit(1);
        }
    } catch (err) {
        console.error(`💥 ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}

main();
