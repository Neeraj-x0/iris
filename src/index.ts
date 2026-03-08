// Core
export { relay, createRelay, isDryRun } from "./relay.js";

// Formatters
export { relayError, relayJSON, relayDeploy } from "./format.js";

// Message builder
export { message, MessageBuilder } from "./builder.js";

// File relay
export { relayFile } from "./file.js";

// Process monitoring
export { watchProcess, startHeartbeat } from "./watch.js";

// Middleware
export { irisMiddleware, irisErrorHandler } from "./middleware.js";

// Multi-channel
export { createChannels } from "./channels.js";

// Types
export type {
    RelayConfig,
    RelayResult,
    TelegramResponse,
    DeployMeta,
    HeartbeatOptions,
    MiddlewareOptions,
    Channel,
} from "./types.js";
