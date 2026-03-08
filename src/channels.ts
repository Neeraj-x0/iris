import { relay, resolveConfig } from "./relay.js";
import type { Channel, RelayConfig, RelayResult } from "./types.js";

/**
 * Multi-channel manager for sending to different Telegram chats.
 *
 * @example
 * ```ts
 * import { createChannels } from "iris-relay";
 *
 * const channels = createChannels([
 *   { name: "alerts", chatId: "-100123456" },
 *   { name: "deploys", chatId: "-100789012", silent: true },
 *   { name: "logs", chatId: "-100345678" },
 * ]);
 *
 * await channels.send("alerts", "🚨 Server is down!");
 * await channels.send("deploys", "🚀 v1.2.3 deployed");
 * await channels.broadcast("System maintenance in 5 minutes");
 * ```
 */
export function createChannels(channels: Channel[], defaultConfig?: RelayConfig) {
    const resolved = resolveConfig(defaultConfig);
    const channelMap = new Map<string, Channel>();

    for (const ch of channels) {
        channelMap.set(ch.name, ch);
    }

    return {
        /** Send a message to a specific channel */
        async send(channelName: string, message: string, config?: RelayConfig): Promise<RelayResult> {
            const channel = channelMap.get(channelName);
            if (!channel) {
                return { success: false, error: `Channel "${channelName}" not found` };
            }

            return relay(message, {
                ...resolved,
                botToken: channel.botToken ?? resolved.botToken,
                chatId: channel.chatId,
                parseMode: channel.parseMode ?? resolved.parseMode,
                silent: channel.silent ?? resolved.silent,
                ...config,
            });
        },

        /** Broadcast a message to all channels */
        async broadcast(message: string, config?: RelayConfig): Promise<Map<string, RelayResult>> {
            const results = new Map<string, RelayResult>();

            for (const [name] of channelMap) {
                results.set(name, await this.send(name, message, config));
            }

            return results;
        },

        /** Get list of registered channel names */
        list(): string[] {
            return Array.from(channelMap.keys());
        },
    };
}
