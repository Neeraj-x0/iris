/** Core relay config */
export interface RelayConfig {
    /** Telegram Bot API token from @BotFather */
    botToken?: string;
    /** Your Telegram chat ID */
    chatId?: string;
    /** Parse mode for messages: HTML, Markdown, or MarkdownV2 */
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    /** Disable link previews in messages */
    disablePreview?: boolean;
    /** Send message silently (no notification sound) */
    silent?: boolean;
    /** Max retries on failure (default: 0) */
    retries?: number;
    /** Base delay in ms for exponential backoff (default: 1000) */
    retryDelay?: number;
}

export interface TelegramResponse {
    ok: boolean;
    result?: {
        message_id: number;
        chat: { id: number; type: string };
        text?: string;
        date: number;
    };
    description?: string;
    error_code?: number;
}

export interface RelayResult {
    success: boolean;
    messageId?: number;
    error?: string;
}

/**
 * Deploy metadata for `relayDeploy()`.
 *
 * All fields are optional. If `branch` and `commit` are not provided,
 * they are **auto-detected** by running `git rev-parse` in the current
 * working directory. If git is not available, they are simply omitted.
 *
 * The latest commit message is also auto-read from `git log -1 --pretty=%s`.
 *
 * @example
 * ```ts
 * // Minimal — auto-reads git info
 * await relayDeploy();
 *
 * // Full — all fields specified
 * await relayDeploy({
 *   app: "my-api",
 *   env: "production",
 *   version: "1.2.3",
 *   branch: "main",           // overrides auto-detected branch
 *   commit: "a1b2c3d",        // overrides auto-detected commit hash
 *   by: "CI/CD Pipeline",
 *   extra: { region: "us-east-1", cluster: "prod-k8s" },
 * });
 * ```
 */
export interface DeployMeta {
    /**
     * Your app or service name.
     * Displayed as: 📦 **App:** my-api
     * @example "my-api", "user-service", "frontend"
     */
    app?: string;

    /**
     * Deployment environment.
     * Displayed as: 🌍 **Env:** production
     * @example "production", "staging", "development"
     */
    env?: string;

    /**
     * Version string (semver, build number, tag, etc.).
     * Displayed as: 🏷️ **Version:** 1.2.3
     * @example "1.2.3", "build-4521", "v2.0.0-beta.1"
     */
    version?: string;

    /**
     * Git branch name.
     * **Auto-detected** via `git rev-parse --abbrev-ref HEAD` if not provided.
     * Displayed as: 🌿 **Branch:** main
     * @example "main", "feat/auth", "release/v2"
     */
    branch?: string;

    /**
     * Git commit hash (short or full).
     * **Auto-detected** via `git rev-parse --short HEAD` if not provided.
     * The commit message is always auto-read from `git log -1 --pretty=%s`.
     * Displayed as: 📝 **Commit:** `a1b2c3d` — fix: resolve login bug
     * @example "a1b2c3d", "a1b2c3d4e5f6"
     */
    commit?: string;

    /**
     * Who triggered the deploy (person, bot, CI system).
     * Displayed as: 👤 **By:** GitHub Actions
     * @example "Neeraj", "GitHub Actions", "Jenkins"
     */
    by?: string;

    /**
     * Custom key-value fields appended to the notification.
     * Each entry is displayed as: • **key:** value
     * @example { region: "us-east-1", duration: "45s" }
     */
    extra?: Record<string, string>;
}

/** Heartbeat options */
export interface HeartbeatOptions {
    /** Interval in ms (default: 60000 = 1 minute) */
    interval?: number;
    /** Custom message (default: "💓 Heartbeat — {app} is alive") */
    message?: string;
    /** App name for the heartbeat message */
    app?: string;
}

/** Middleware options for Express/Fastify */
export interface MiddlewareOptions {
    /** Slow request threshold in ms (default: 3000) */
    slowThreshold?: number;
    /** Report errors to Telegram (default: true) */
    reportErrors?: boolean;
    /** Report slow requests to Telegram (default: true) */
    reportSlow?: boolean;
    /** Relay config overrides */
    relay?: RelayConfig;
}

/** Channel definition for multi-channel support */
export interface Channel {
    name: string;
    chatId: string;
    /** Optional separate bot token per channel */
    botToken?: string;
    /** Default parse mode for this channel */
    parseMode?: RelayConfig["parseMode"];
    /** Send silently by default */
    silent?: boolean;
}
