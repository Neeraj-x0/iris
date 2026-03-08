import { resolveConfig, isDryRun } from "./relay.js";
import type { RelayConfig, RelayResult, TelegramResponse } from "./types.js";
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { stat } from "node:fs/promises";

const TG_API = "https://api.telegram.org";

/**
 * Send a file to your Telegram chat via sendDocument API.
 *
 * @example
 * ```ts
 * import { relayFile } from "iris-relay";
 * await relayFile("./logs/error.log", "Latest error log");
 * ```
 */
export async function relayFile(
    filePath: string,
    caption?: string,
    config?: RelayConfig
): Promise<RelayResult> {
    const { botToken, chatId, silent, parseMode } = resolveConfig(config);

    if (isDryRun()) {
        console.log(`[iris-relay DRY RUN] 📎 File: ${filePath}${caption ? ` — ${caption}` : ""}`);
        return { success: true, messageId: 0 };
    }

    // Check file exists
    try {
        await stat(filePath);
    } catch {
        return { success: false, error: `File not found: ${filePath}` };
    }

    const form = new FormData();
    form.append("chat_id", chatId);

    // Read file as buffer
    const fileStream = createReadStream(filePath);
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);
    const blob = new Blob([fileBuffer]);
    form.append("document", blob, basename(filePath));

    if (caption) form.append("caption", caption);
    if (parseMode) form.append("parse_mode", parseMode);
    if (silent) form.append("disable_notification", "true");

    try {
        const res = await fetch(`${TG_API}/bot${botToken}/sendDocument`, {
            method: "POST",
            body: form,
        });

        const data = (await res.json()) as TelegramResponse;

        if (!data.ok) {
            return { success: false, error: data.description ?? `Telegram API error (${data.error_code})` };
        }

        return { success: true, messageId: data.result?.message_id };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}
