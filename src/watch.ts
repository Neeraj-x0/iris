import { relay } from "./relay.js";
import { relayError } from "./format.js";
import type { RelayConfig, HeartbeatOptions } from "./types.js";

/**
 * Watch for uncaught exceptions and unhandled rejections.
 * Sends crash reports to Telegram before the process exits.
 *
 * @example
 * ```ts
 * import { watchProcess } from "iris-relay";
 * watchProcess(); // done — crashes get reported
 * ```
 */
export function watchProcess(config?: RelayConfig): void {
    process.on("uncaughtException", async (err) => {
        console.error("[iris-relay] Uncaught Exception:", err);
        try {
            await relayError(err, config);
        } catch { /* don't throw during crash handler */ }
        process.exit(1);
    });

    process.on("unhandledRejection", async (reason) => {
        console.error("[iris-relay] Unhandled Rejection:", reason);
        try {
            const err = reason instanceof Error ? reason : new Error(String(reason));
            await relayError(err, config);
        } catch { /* don't throw during crash handler */ }
    });

    // Notify on graceful shutdown
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
        process.on(signal, async () => {
            try {
                await relay(`⚠️ Process received ${signal} — shutting down`, config);
            } catch { /* best effort */ }
            process.exit(0);
        });
    }
}

/**
 * Start sending periodic heartbeat messages.
 * Returns a cleanup function to stop the heartbeat.
 *
 * @example
 * ```ts
 * import { startHeartbeat } from "iris-relay";
 *
 * const stop = startHeartbeat({ interval: 60000, app: "my-api" });
 * // Later: stop();
 * ```
 */
export function startHeartbeat(options?: HeartbeatOptions, config?: RelayConfig): () => void {
    const interval = options?.interval ?? 60_000;
    const app = options?.app ?? "Service";
    const msg = options?.message ?? `💓 Heartbeat — <b>${app}</b> is alive`;

    const id = setInterval(async () => {
        try {
            await relay(msg, { parseMode: "HTML", silent: true, ...config });
        } catch (err) {
            console.error("[iris-relay] Heartbeat failed:", err);
        }
    }, interval);

    // Don't prevent process from exiting
    id.unref();

    return () => clearInterval(id);
}
