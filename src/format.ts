import { relay, isDryRun, resolveConfig } from "./relay.js";
import type { RelayConfig, RelayResult, DeployMeta } from "./types.js";
import { execSync } from "node:child_process";

/**
 * Relay a formatted error with stack trace to Telegram.
 *
 * @example
 * ```ts
 * catch (err) { await relayError(err); }
 * ```
 */
export async function relayError(err: unknown, config?: RelayConfig): Promise<RelayResult> {
    let message: string;

    if (err instanceof Error) {
        message = `🚨 <b>Error:</b> ${escapeHtml(err.message)}\n\n<pre>${escapeHtml(err.stack ?? "No stack trace")}</pre>`;
    } else {
        message = `🚨 <b>Error:</b>\n<pre>${escapeHtml(String(err))}</pre>`;
    }

    return relay(message, { parseMode: "HTML", ...config });
}

/**
 * Relay a pretty-printed JSON object to Telegram.
 *
 * @example
 * ```ts
 * await relayJSON({ users: 42, status: "healthy" });
 * ```
 */
export async function relayJSON(obj: unknown, label?: string, config?: RelayConfig): Promise<RelayResult> {
    const json = JSON.stringify(obj, null, 2);
    const header = label ? `📋 <b>${escapeHtml(label)}</b>\n\n` : "";
    const message = `${header}<pre>${escapeHtml(json)}</pre>`;
    return relay(message, { parseMode: "HTML", ...config });
}

/** Try to read git info, returns undefined if git is not available */
function tryGit(cmd: string): string | undefined {
    try {
        return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    } catch {
        return undefined;
    }
}

/**
 * Send a deploy notification to Telegram.
 *
 * **How git auto-detection works:**
 * - `branch` → runs `git rev-parse --abbrev-ref HEAD` to get the current branch (e.g. "main")
 * - `commit` → runs `git rev-parse --short HEAD` to get the short commit hash (e.g. "a1b2c3d")
 * - Commit message → always auto-read via `git log -1 --pretty=%s` (e.g. "fix: resolve login bug")
 *
 * If git is not installed or you're not in a git repo, these fields are silently skipped.
 * You can override any auto-detected value by passing it in the `meta` object.
 *
 * **Example Telegram message:**
 * ```
 * 🚀 Deploy Notification
 *
 * 📦 App: my-api
 * 🌍 Env: production
 * 🏷️ Version: 1.2.3
 * 🌿 Branch: main
 * 📝 Commit: a1b2c3d — fix: resolve login bug
 * 👤 By: GitHub Actions
 * ⏰ Time: 2026-03-08T12:00:00.000Z
 * • region: us-east-1
 * ```
 *
 * @param meta - Optional deploy metadata. All fields are optional.
 * @param config - Optional relay config overrides.
 *
 * @example
 * ```ts
 * // Minimal — just sends git info + timestamp
 * await relayDeploy();
 *
 * // With app info
 * await relayDeploy({ app: "my-api", env: "production" });
 *
 * // Full — all fields
 * await relayDeploy({
 *   app: "my-api",
 *   env: "production",
 *   version: "1.2.3",
 *   by: "CI/CD Pipeline",
 *   extra: { region: "us-east-1", duration: "45s" },
 * });
 *
 * // In a CI/CD pipeline (GitHub Actions example)
 * await relayDeploy({
 *   app: "my-api",
 *   env: "production",
 *   version: process.env.npm_package_version,
 *   by: `GitHub Actions (${process.env.GITHUB_ACTOR})`,
 *   commit: process.env.GITHUB_SHA?.slice(0, 7),
 *   branch: process.env.GITHUB_REF_NAME,
 * });
 * ```
 */
export async function relayDeploy(meta?: DeployMeta, config?: RelayConfig): Promise<RelayResult> {
    const branch = meta?.branch ?? tryGit("git rev-parse --abbrev-ref HEAD");
    const commit = meta?.commit ?? tryGit("git rev-parse --short HEAD");
    const commitMsg = tryGit("git log -1 --pretty=%s");

    const lines: string[] = ["🚀 <b>Deploy Notification</b>", ""];

    if (meta?.app) lines.push(`📦 <b>App:</b> ${escapeHtml(meta.app)}`);
    if (meta?.env) lines.push(`🌍 <b>Env:</b> ${escapeHtml(meta.env)}`);
    if (meta?.version) lines.push(`🏷️ <b>Version:</b> ${escapeHtml(meta.version)}`);
    if (branch) lines.push(`🌿 <b>Branch:</b> ${escapeHtml(branch)}`);
    if (commit) lines.push(`📝 <b>Commit:</b> <code>${escapeHtml(commit)}</code>${commitMsg ? ` — ${escapeHtml(commitMsg)}` : ""}`);
    if (meta?.by) lines.push(`👤 <b>By:</b> ${escapeHtml(meta.by)}`);
    lines.push(`⏰ <b>Time:</b> ${new Date().toISOString()}`);

    if (meta?.extra) {
        for (const [key, value] of Object.entries(meta.extra)) {
            lines.push(`• <b>${escapeHtml(key)}:</b> ${escapeHtml(value)}`);
        }
    }

    return relay(lines.join("\n"), { parseMode: "HTML", ...config });
}

/** Escape HTML special characters for Telegram HTML parse mode */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
