#!/usr/bin/env node

import { config } from "dotenv";
import { relay } from "./relay.js";
import { relayFile } from "./file.js";

config();

const args = process.argv.slice(2);

function printHelp() {
    console.log(`
iris-relay — Send messages to Telegram from the CLI

Usage:
  iris-relay "Your message here"
  iris-relay --file ./path/to/file.log "Optional caption"
  iris-relay --silent "No notification sound"
  iris-relay --html "<b>Bold</b> message"

Options:
  --file <path>    Send a file instead of a text message
  --silent         Send without notification sound
  --html           Parse message as HTML
  --markdown       Parse message as Markdown
  --help, -h       Show this help message

Environment:
  XERO_BOT_TOKEN   Your Telegram bot token
  XERO_CHAT_ID     Your Telegram chat ID
`);
}

async function main() {
    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
        printHelp();
        process.exit(0);
    }

    const silent = args.includes("--silent");
    const html = args.includes("--html");
    const markdown = args.includes("--markdown");
    const fileIdx = args.indexOf("--file");

    // Filter out flags to get the message
    const messageArgs = args.filter(
        (a, i) => !a.startsWith("--") && !(i === fileIdx + 1 && fileIdx >= 0)
    );
    const message = messageArgs.join(" ");

    const parseMode = html ? "HTML" as const : markdown ? "Markdown" as const : undefined;

    try {
        // File mode
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

        // Message mode
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
