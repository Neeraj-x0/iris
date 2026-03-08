import { relay } from "./relay.js";
import type { RelayConfig, RelayResult } from "./types.js";

/** Escape HTML special characters */
function esc(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Fluent message builder for composing formatted Telegram messages.
 *
 * @example
 * ```ts
 * import { message } from "iris-relay";
 *
 * await message()
 *   .bold("Deploy")
 *   .text(" ")
 *   .code("v1.2.3")
 *   .text(" to ")
 *   .italic("production")
 *   .send();
 * ```
 */
export class MessageBuilder {
    private parts: string[] = [];
    private config: RelayConfig = { parseMode: "HTML" };

    /** Add plain text */
    text(content: string): this {
        this.parts.push(esc(content));
        return this;
    }

    /** Add bold text */
    bold(content: string): this {
        this.parts.push(`<b>${esc(content)}</b>`);
        return this;
    }

    /** Add italic text */
    italic(content: string): this {
        this.parts.push(`<i>${esc(content)}</i>`);
        return this;
    }

    /** Add inline code */
    code(content: string): this {
        this.parts.push(`<code>${esc(content)}</code>`);
        return this;
    }

    /** Add a code block with optional language */
    codeBlock(content: string, lang?: string): this {
        const langAttr = lang ? ` class="language-${esc(lang)}"` : "";
        this.parts.push(`<pre${langAttr}>${esc(content)}</pre>`);
        return this;
    }

    /** Add a strikethrough text */
    strike(content: string): this {
        this.parts.push(`<s>${esc(content)}</s>`);
        return this;
    }

    /** Add underlined text */
    underline(content: string): this {
        this.parts.push(`<u>${esc(content)}</u>`);
        return this;
    }

    /** Add a link */
    link(text: string, url: string): this {
        this.parts.push(`<a href="${esc(url)}">${esc(text)}</a>`);
        return this;
    }

    /** Add a newline */
    br(): this {
        this.parts.push("\n");
        return this;
    }

    /** Add a horizontal separator */
    separator(): this {
        this.parts.push("\n———————————\n");
        return this;
    }

    /** Override relay config for this message */
    withConfig(config: RelayConfig): this {
        this.config = { ...this.config, ...config };
        return this;
    }

    /** Build the message string without sending */
    build(): string {
        return this.parts.join("");
    }

    /** Send the composed message */
    async send(config?: RelayConfig): Promise<RelayResult> {
        return relay(this.build(), { ...this.config, ...config });
    }
}

/** Create a new message builder */
export function message(): MessageBuilder {
    return new MessageBuilder();
}
