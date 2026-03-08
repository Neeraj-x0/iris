#!/usr/bin/env node

import { config } from "dotenv";
import { relay } from "./relay.js";
import { relayFile } from "./file.js";
import { createInterface } from "node:readline/promises";
import { writeFileSync, existsSync, readFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

config({ quiet: true });

const args = process.argv.slice(2);

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
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (allDeps["next"]) return "next";
        if (allDeps["express"]) return "express";
        if (allDeps["fastify"]) return "fastify";
        if (allDeps["hono"]) return "hono";
        if (allDeps["koa"]) return "koa";
    } catch { /* ignore parse errors */ }
    return null;
}

/** Validate Telegram bot token format: <digits>:<alphanumeric+_-> */
function isValidBotToken(token: string): boolean {
    return /^\d+:[A-Za-z0-9_-]{30,}$/.test(token);
}

/** Validate chat ID: numeric, optionally negative (for groups) */
function isValidChatId(id: string): boolean {
    return /^-?\d+$/.test(id);
}

/** Check if XERO_ env vars exist in the system (not from .env) */
function detectSystemEnv(): { botToken: boolean; chatId: boolean } {
    // Temporarily clear loaded .env values to check system-level
    const envPath = join(process.cwd(), ".env");
    const envVars: Record<string, string> = {};

    if (existsSync(envPath)) {
        const content = readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
            const match = line.match(/^([^#=]+)=(.*)$/);
            if (match) envVars[match[1].trim()] = match[2].trim();
        }
    }

    const sysBot = process.env.XERO_BOT_TOKEN && process.env.XERO_BOT_TOKEN !== envVars["XERO_BOT_TOKEN"];
    const sysChat = process.env.XERO_CHAT_ID && process.env.XERO_CHAT_ID !== envVars["XERO_CHAT_ID"];

    return { botToken: !!sysBot, chatId: !!sysChat };
}

interface ExistingConfig {
    hasEnv: boolean;
    hasBotToken: boolean;
    hasChatId: boolean;
    hasStarterFile: boolean;
    starterFileName: string | null;
    hasWorkflow: boolean;
    hasDockerCompose: boolean;
}

/** Detect existing iris-relay configuration */
function detectExisting(): ExistingConfig {
    const envPath = join(process.cwd(), ".env");
    let hasBotToken = false;
    let hasChatId = false;

    if (existsSync(envPath)) {
        const content = readFileSync(envPath, "utf-8");
        hasBotToken = content.includes("XERO_BOT_TOKEN=");
        hasChatId = content.includes("XERO_CHAT_ID=");
    }

    const hasTsStarter = existsSync(join(process.cwd(), "iris.ts"));
    const hasJsStarter = existsSync(join(process.cwd(), "iris.js"));

    return {
        hasEnv: existsSync(envPath),
        hasBotToken,
        hasChatId,
        hasStarterFile: hasTsStarter || hasJsStarter,
        starterFileName: hasTsStarter ? "iris.ts" : hasJsStarter ? "iris.js" : null,
        hasWorkflow: existsSync(join(process.cwd(), ".github", "workflows", "iris-notify.yml")),
        hasDockerCompose: existsSync(join(process.cwd(), "docker-compose.yml")),
    };
}

/** Remove XERO_ vars from .env, cleaning up comments too */
function cleanEnv(): void {
    const envPath = join(process.cwd(), ".env");
    if (!existsSync(envPath)) return;

    const lines = readFileSync(envPath, "utf-8").split("\n");
    const cleaned = lines.filter((line) => {
        const trimmed = line.trim();
        if (trimmed === "# iris-relay config") return false;
        if (trimmed.startsWith("XERO_BOT_TOKEN=")) return false;
        if (trimmed.startsWith("XERO_CHAT_ID=")) return false;
        if (trimmed.startsWith("XERO_DRY_RUN=")) return false;
        return true;
    });

    // Remove trailing empty lines
    while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === "") {
        cleaned.pop();
    }

    if (cleaned.length === 0 || cleaned.every((l) => l.trim() === "")) {
        unlinkSync(envPath);
        console.log("  🗑️  .env removed (was empty after cleanup)");
    } else {
        writeFileSync(envPath, cleaned.join("\n") + "\n");
        console.log("  🧹 XERO_ vars removed from .env");
    }
}

// ─── Help ────────────────────────────────────────────────────

function printHelp() {
    console.log(`
iris-relay — Telegram message relay for developers

Commands:
  iris-relay init              Interactive setup wizard
  iris-relay reset             Remove iris-relay config from project
  iris-relay doctor            Validate config and test connection
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

// ─── Doctor ──────────────────────────────────────────────────

async function runDoctor() {
    console.log("\n🩺 iris-relay doctor\n");

    const existing = detectExisting();
    const systemEnv = detectSystemEnv();
    let issues = 0;

    // .env file
    if (existing.hasEnv) {
        console.log("  ✅ .env file found");
    } else {
        console.log("  ❌ .env file not found");
        issues++;
    }

    // Bot token
    const botToken = process.env.XERO_BOT_TOKEN;
    if (botToken) {
        if (isValidBotToken(botToken)) {
            console.log("  ✅ XERO_BOT_TOKEN is set and valid format");
            if (systemEnv.botToken) console.log("     ℹ️  (loaded from system environment)");
        } else {
            console.log("  ⚠️  XERO_BOT_TOKEN is set but format looks invalid");
            console.log("     Expected: <number>:<alphanumeric string>");
            issues++;
        }
    } else {
        console.log("  ❌ XERO_BOT_TOKEN is not set");
        issues++;
    }

    // Chat ID
    const chatId = process.env.XERO_CHAT_ID;
    if (chatId) {
        if (isValidChatId(chatId)) {
            console.log("  ✅ XERO_CHAT_ID is set and valid format");
            if (systemEnv.chatId) console.log("     ℹ️  (loaded from system environment)");
        } else {
            console.log("  ⚠️  XERO_CHAT_ID is set but format looks invalid");
            console.log("     Expected: numeric (negative for groups)");
            issues++;
        }
    } else {
        console.log("  ❌ XERO_CHAT_ID is not set");
        issues++;
    }

    // Dry run
    if (process.env.XERO_DRY_RUN === "true" || process.env.XERO_DRY_RUN === "1") {
        console.log("  ⚠️  XERO_DRY_RUN is enabled — messages will be logged, not sent");
    }

    // .gitignore
    const gitignorePath = join(process.cwd(), ".gitignore");
    if (existsSync(gitignorePath)) {
        const gitignore = readFileSync(gitignorePath, "utf-8");
        if (gitignore.includes(".env")) {
            console.log("  ✅ .env is in .gitignore");
        } else {
            console.log("  ⚠️  .env is NOT in .gitignore — secrets may be committed!");
            issues++;
        }
    }

    // Generated files
    if (existing.hasStarterFile) console.log(`  ✅ Starter file: ${existing.starterFileName}`);
    if (existing.hasWorkflow) console.log("  ✅ GitHub Actions workflow found");

    // Connection test
    if (botToken && chatId && process.env.XERO_DRY_RUN !== "true") {
        console.log("\n  🧪 Testing connection...");
        try {
            const result = await relay("🩺 iris-relay doctor — connection test");
            if (result.success) {
                console.log("  ✅ Connection works! Message sent to Telegram.");
            } else {
                console.log(`  ❌ Connection failed: ${result.error}`);
                issues++;
            }
        } catch (err) {
            console.log(`  ❌ Connection error: ${err instanceof Error ? err.message : String(err)}`);
            issues++;
        }
    }

    console.log(`\n  ${issues === 0 ? "🎉 All checks passed!" : `⚠️  ${issues} issue(s) found`}\n`);
    process.exit(issues > 0 ? 1 : 0);
}

// ─── Reset ───────────────────────────────────────────────────

async function runReset() {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const existing = detectExisting();

    console.log("\n🔄 iris-relay reset\n");

    if (!existing.hasBotToken && !existing.hasStarterFile && !existing.hasWorkflow) {
        console.log("  Nothing to reset — iris-relay is not configured in this project.\n");
        rl.close();
        process.exit(0);
    }

    console.log("  This will remove:");
    if (existing.hasBotToken || existing.hasChatId) console.log("    • XERO_* variables from .env");
    if (existing.hasStarterFile) console.log(`    • ${existing.starterFileName}`);
    if (existing.hasWorkflow) console.log("    • .github/workflows/iris-notify.yml");

    const confirm = yn(await rl.question("\n  Continue? (y/N): "));
    rl.close();

    if (!confirm) {
        console.log("\n  Cancelled.\n");
        process.exit(0);
    }

    console.log("");

    // Clean .env
    if (existing.hasBotToken || existing.hasChatId) {
        cleanEnv();
    }

    // Remove starter file
    if (existing.hasStarterFile && existing.starterFileName) {
        unlinkSync(join(process.cwd(), existing.starterFileName));
        console.log(`  🗑️  ${existing.starterFileName} removed`);
    }

    // Remove workflow
    if (existing.hasWorkflow) {
        unlinkSync(join(process.cwd(), ".github", "workflows", "iris-notify.yml"));
        console.log("  🗑️  .github/workflows/iris-notify.yml removed");
    }

    console.log("\n  ✅ Reset complete.\n");
}

// ─── Interactive Setup ───────────────────────────────────────

async function runInit() {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const pm = detectPackageManager();
    const framework = detectFramework();
    const existing = detectExisting();
    const systemEnv = detectSystemEnv();

    console.log(`
╔══════════════════════════════════════════╗
║        🛰️  iris-relay setup wizard       ║
╚══════════════════════════════════════════╝
`);

    if (framework) console.log(`  Detected: ${framework} project (${pm})`);

    // ── Check existing config ────────────────────

    if (existing.hasBotToken || existing.hasChatId) {
        console.log("\n  ⚠️  iris-relay is already configured in this project.");

        if (existing.hasBotToken) console.log("    • XERO_BOT_TOKEN found in .env");
        if (existing.hasChatId) console.log("    • XERO_CHAT_ID found in .env");
        if (existing.hasStarterFile) console.log(`    • ${existing.starterFileName} exists`);
        if (existing.hasWorkflow) console.log("    • GitHub Actions workflow exists");

        const proceed = yn(await rl.question("\n  Re-initialize? This will override existing config. (y/N): "));

        if (!proceed) {
            console.log("\n  Cancelled. Run 'iris-relay doctor' to check your config.\n");
            rl.close();
            process.exit(0);
        }

        console.log("");
    }

    // ── System env detection ─────────────────────

    if (systemEnv.botToken || systemEnv.chatId) {
        console.log("  ℹ️  System-level environment variables detected:");
        if (systemEnv.botToken) console.log("    • XERO_BOT_TOKEN is set at system/shell level");
        if (systemEnv.chatId) console.log("    • XERO_CHAT_ID is set at system/shell level");
        console.log("    → .env values will take priority over system vars when both exist");
        console.log("    → For production, consider using system env or secrets manager instead of .env\n");
    }

    // ── Step 1: Credentials ──────────────────────

    console.log("Step 1 — Telegram Credentials\n");
    console.log("  Get bot token → https://t.me/BotFather");
    console.log("  Get chat ID   → https://t.me/userinfobot\n");

    let botToken = "";
    while (true) {
        botToken = (await rl.question("  XERO_BOT_TOKEN: ")).trim();
        if (!botToken) {
            console.error("  ❌ Bot token is required.\n");
            continue;
        }
        if (!isValidBotToken(botToken)) {
            console.log("  ⚠️  Token format looks invalid. Expected: <number>:<alphanumeric>");
            const useAnyway = yn(await rl.question("  Use it anyway? (y/N): "));
            if (!useAnyway) continue;
        }
        break;
    }

    let chatId = "";
    while (true) {
        chatId = (await rl.question("  XERO_CHAT_ID: ")).trim();
        if (!chatId) {
            console.error("  ❌ Chat ID is required.\n");
            continue;
        }
        if (!isValidChatId(chatId)) {
            console.log("  ⚠️  Chat ID should be numeric (negative for groups).");
            const useAnyway = yn(await rl.question("  Use it anyway? (y/N): "));
            if (!useAnyway) continue;
        }
        break;
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

    let generateStarter = true;
    if (existing.hasStarterFile) {
        generateStarter = yn(
            await rl.question(`  📄 Overwrite existing ${existing.starterFileName}? (y/N): `)
        );
    } else {
        generateStarter = yn(
            await rl.question("  📄 Generate a starter file (iris.ts / iris.js)? (Y/n): ") || "y"
        );
    }

    let generateCI = false;
    if (existing.hasWorkflow) {
        generateCI = yn(
            await rl.question("  🚀 Overwrite existing GitHub Actions workflow? (y/N): ")
        );
    } else {
        generateCI = yn(
            await rl.question("  🚀 Generate GitHub Actions deploy notification? (y/N): ")
        );
    }

    const generateDocker = yn(
        await rl.question("  🐳 Add XERO_ env vars to docker-compose.yml? (y/N): ")
    );

    rl.close();

    // ── Preview changes ──────────────────────────

    console.log("\n── Changes to apply ──\n");

    const changes: string[] = [];
    if (existing.hasBotToken || existing.hasChatId) {
        changes.push("  • Update XERO_* vars in .env (old values will be replaced)");
    } else {
        changes.push("  • Add XERO_* vars to .env");
    }
    if (generateStarter) changes.push(`  • ${existing.hasStarterFile ? "Overwrite" : "Create"} starter file`);
    if (generateCI) changes.push(`  • ${existing.hasWorkflow ? "Overwrite" : "Create"} GitHub Actions workflow`);
    if (generateDocker) changes.push("  • Docker Compose env setup");
    changes.push("  • Ensure .env is in .gitignore");

    changes.forEach((c) => console.log(c));

    // ── Write .env ───────────────────────────────

    console.log("\n── Writing files ──\n");

    const envPath = join(process.cwd(), ".env");
    let envContent = "";

    if (existsSync(envPath)) {
        const existingContent = readFileSync(envPath, "utf-8");
        envContent = existingContent
            .split("\n")
            .filter((line) =>
                !line.trim().startsWith("XERO_BOT_TOKEN=") &&
                !line.trim().startsWith("XERO_CHAT_ID=") &&
                !line.trim().startsWith("XERO_DRY_RUN=") &&
                line.trim() !== "# iris-relay config"
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
    console.log(`  ✅ .env → ${envPath}`);

    // ── .gitignore ───────────────────────────────

    const gitignorePath = join(process.cwd(), ".gitignore");
    if (existsSync(gitignorePath)) {
        const gitignore = readFileSync(gitignorePath, "utf-8");
        if (!gitignore.includes(".env")) {
            writeFileSync(gitignorePath, gitignore.trimEnd() + "\n.env\n");
            console.log("  ✅ .env added to .gitignore");
        }
    } else {
        writeFileSync(gitignorePath, "node_modules\n.env\n");
        console.log("  ✅ .gitignore created");
    }

    // ── Starter file ─────────────────────────────

    if (generateStarter) {
        const isTS = existsSync(join(process.cwd(), "tsconfig.json"));
        const ext = isTS ? "ts" : "js";
        const starterPath = join(process.cwd(), `iris.${ext}`);
        const imp = (mod: string, names: string) =>
            isTS ? `import { ${names} } from "${mod}";` : `const { ${names} } = require("${mod}");`;

        let starter = imp("iris-relay", "relay, relayError, relayDeploy") + "\n";

        if (enableCrashWatch) {
            starter += `${imp("iris-relay", "watchProcess")}\n`;
            starter += `\n// Auto-report uncaught exceptions & unhandled rejections\n`;
            starter += `watchProcess();\n`;
        }

        if (enableHeartbeat) {
            starter += `${imp("iris-relay", "startHeartbeat")}\n`;
            starter += `\n// Send periodic heartbeat (every ${heartbeatInterval}s)\n`;
            starter += `const stopHeartbeat = startHeartbeat({\n`;
            starter += `  interval: ${heartbeatInterval * 1000},\n`;
            starter += `  app: "${appName}",\n`;
            starter += `});\n`;
        }

        if (enableMiddleware && framework === "express") {
            starter += `${imp("iris-relay", "irisMiddleware, irisErrorHandler")}\n`;
            starter += `\n// Add to your Express app:\n`;
            starter += `// app.use(irisMiddleware({ slowThreshold: 3000 }));\n`;
            starter += `// app.use(irisErrorHandler()); // after all routes\n`;
        }

        starter += `\n// ── Examples ──\n\n`;
        starter += `// Send a message\n`;
        starter += `// await relay("Server started 🚀");\n\n`;
        starter += `// Report an error\n`;
        starter += `// try { ... } catch (err) { await relayError(err); }\n\n`;
        starter += `// Deploy notification (auto-reads git info)\n`;
        starter += `// await relayDeploy({ app: "${appName || "my-app"}", env: "production" });\n`;

        writeFileSync(starterPath, starter);
        console.log(`  ✅ iris.${ext} → ${starterPath}`);
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
        console.log(`  ✅ GitHub Actions → ${workflowPath}`);
        console.log("     ⚠️  Add XERO_BOT_TOKEN and XERO_CHAT_ID as repo secrets!");
    }

    // ── Docker Compose ───────────────────────────

    if (generateDocker) {
        const composePath = join(process.cwd(), "docker-compose.yml");

        if (existsSync(composePath)) {
            const existingContent = readFileSync(composePath, "utf-8");
            if (!existingContent.includes("XERO_BOT_TOKEN")) {
                const envBlock = `    # iris-relay\n    environment:\n      - XERO_BOT_TOKEN=\${XERO_BOT_TOKEN}\n      - XERO_CHAT_ID=\${XERO_CHAT_ID}`;
                console.log(`\n  📋 Add this to your service in docker-compose.yml:\n${envBlock}`);
            } else {
                console.log("  ℹ️  XERO_ vars already in docker-compose.yml");
            }
        } else {
            const composeContent = `version: "3.8"\n\nservices:\n  app:\n    build: .\n    env_file:\n      - .env\n    environment:\n      - XERO_BOT_TOKEN=\${XERO_BOT_TOKEN}\n      - XERO_CHAT_ID=\${XERO_CHAT_ID}\n`;
            writeFileSync(composePath, composeContent);
            console.log(`  ✅ docker-compose.yml → ${composePath}`);
        }
    }

    // ── Test connection ──────────────────────────

    console.log("\n── Testing connection ──\n");
    process.env.XERO_BOT_TOKEN = botToken;
    process.env.XERO_CHAT_ID = chatId;

    const result = await relay("✅ iris-relay connected successfully!");
    if (result.success) {
        console.log("  ✅ Test message sent! Check your Telegram.");
    } else {
        console.error(`  ⚠️  Test failed: ${result.error}`);
        console.log("     Your .env was still saved — double-check your token and chat ID.");
        console.log("     Run 'iris-relay doctor' to diagnose issues.");
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

  Commands:
    iris-relay doctor    validate your config
    iris-relay reset     remove iris-relay config
    iris-relay "msg"     send a quick message
`);
}

// ─── Message / File Sending ──────────────────────────────────

async function main() {
    const command = args[0];

    if (command === "init") {
        await runInit();
        return;
    }

    if (command === "reset") {
        await runReset();
        return;
    }

    if (command === "doctor") {
        await runDoctor();
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

            const result = await relayFile(filePath, message || undefined, { silent, parseMode });

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
