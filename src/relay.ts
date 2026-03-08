import { config } from "dotenv";
import type { RelayConfig, RelayResult, TelegramResponse } from "./types.js";

// Auto-load .env on import — true plug-and-play
config();

const TG_API = "https://api.telegram.org";

/** Check if dry run mode is enabled */
export function isDryRun(): boolean {
    return process.env.XERO_DRY_RUN === "true" || process.env.XERO_DRY_RUN === "1";
}

export function resolveConfig(overrides?: RelayConfig) {
    const botToken = overrides?.botToken
        ?? process.env.XERO_BOT_TOKEN;
    const chatId = overrides?.chatId
        ?? process.env.XERO_CHAT_ID;

    if (!botToken) throw new Error("iris: botToken is required — pass it in config or set XERO_BOT_TOKEN env var");
    if (!chatId) throw new Error("iris: chatId is required — pass it in config or set XERO_CHAT_ID env var");

    return { botToken, chatId, ...overrides };
}

/** Sleep helper for retry backoff */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a message to your Telegram chat.
 * Supports dry run mode, retries with exponential backoff.
 */
export async function relay(message: string, config?: RelayConfig): Promise<RelayResult> {
    const { botToken, chatId, parseMode, disablePreview, silent, retries = 0, retryDelay = 1000 } = resolveConfig(config);

    // Dry run — log to console instead
    if (isDryRun()) {
        console.log(`[iris-relay DRY RUN] → ${message}`);
        return { success: true, messageId: 0 };
    }

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) {
            const delay = retryDelay * Math.pow(2, attempt - 1);
            console.log(`[iris-relay] Retry ${attempt}/${retries} in ${delay}ms...`);
            await sleep(delay);
        }

        try {
            const res = await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    ...(parseMode && { parse_mode: parseMode }),
                    ...(disablePreview && { disable_web_page_preview: true }),
                    ...(silent && { disable_notification: true }),
                }),
            });

            const data = (await res.json()) as TelegramResponse;

            if (data.ok) {
                return { success: true, messageId: data.result?.message_id };
            }

            lastError = data.description ?? `Telegram API error (${data.error_code})`;

            // Don't retry on 4xx client errors (bad token, bad chat id, etc.)
            if (data.error_code && data.error_code >= 400 && data.error_code < 500) {
                return { success: false, error: lastError };
            }
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
        }
    }

    return { success: false, error: lastError };
}

/**
 * Create a pre-configured relay function with baked-in credentials.
 */
export function createRelay(config: RelayConfig) {
    const resolved = resolveConfig(config);
    return (message: string, overrides?: Partial<RelayConfig>): Promise<RelayResult> =>
        relay(message, { ...resolved, ...overrides });
}
