import { relay } from "./relay.js";
import type { MiddlewareOptions, RelayConfig } from "./types.js";

/**
 * Express/Fastify-compatible middleware that reports errors and slow requests to Telegram.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { irisMiddleware } from "iris-relay";
 *
 * const app = express();
 * app.use(irisMiddleware({ slowThreshold: 3000 }));
 * ```
 */
export function irisMiddleware(options?: MiddlewareOptions) {
    const {
        slowThreshold = 3000,
        reportErrors = true,
        reportSlow = true,
        relay: relayConfig,
    } = options ?? {};

    // Standard Express middleware signature
    return (req: any, res: any, next: any) => {
        const start = Date.now();
        const method = req.method;
        const url = req.originalUrl || req.url;

        // Hook into response finish to check timing
        res.on("finish", async () => {
            const duration = Date.now() - start;
            const status = res.statusCode;

            // Report slow requests
            if (reportSlow && duration > slowThreshold) {
                const msg = `🐢 <b>Slow Request</b>\n\n` +
                    `<b>Method:</b> ${method}\n` +
                    `<b>URL:</b> <code>${escapeHtml(url)}</code>\n` +
                    `<b>Status:</b> ${status}\n` +
                    `<b>Duration:</b> ${duration}ms (threshold: ${slowThreshold}ms)`;

                relay(msg, { parseMode: "HTML", silent: true, ...relayConfig }).catch(() => { });
            }

            // Report server errors (5xx)
            if (reportErrors && status >= 500) {
                const msg = `🔥 <b>Server Error ${status}</b>\n\n` +
                    `<b>Method:</b> ${method}\n` +
                    `<b>URL:</b> <code>${escapeHtml(url)}</code>\n` +
                    `<b>Duration:</b> ${duration}ms`;

                relay(msg, { parseMode: "HTML", ...relayConfig }).catch(() => { });
            }
        });

        next();
    };
}

/**
 * Express error-handling middleware that sends error details to Telegram.
 *
 * @example
 * ```ts
 * // Add AFTER all routes
 * app.use(irisErrorHandler());
 * ```
 */
export function irisErrorHandler(config?: RelayConfig) {
    return (err: any, req: any, res: any, next: any) => {
        const method = req.method;
        const url = req.originalUrl || req.url;

        const msg = `🚨 <b>Unhandled Error</b>\n\n` +
            `<b>Method:</b> ${method}\n` +
            `<b>URL:</b> <code>${escapeHtml(url)}</code>\n` +
            `<b>Error:</b> ${escapeHtml(err.message ?? String(err))}\n\n` +
            `<pre>${escapeHtml(err.stack ?? "No stack trace")}</pre>`;

        relay(msg, { parseMode: "HTML", ...config }).catch(() => { });

        next(err);
    };
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
