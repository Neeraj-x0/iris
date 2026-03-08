import { relay, createRelay } from "./src/index.js";
// No need to import dotenv — iris-relay auto-loads .env

async function main() {
    console.log("🧪 iris-relay test\n");

    // Test 1: One-off relay
    console.log("── Test 1: relay() ──");
    const result = await relay("🧪 Test message from iris-relay");
    console.log("Result:", result);

    if (!result.success) {
        console.error("❌ relay() failed:", result.error);
        process.exit(1);
    }
    console.log("✅ relay() passed — message ID:", result.messageId, "\n");

    // Test 2: createRelay with options
    console.log("── Test 2: createRelay() ──");
    const send = createRelay({
        parseMode: "HTML",
        silent: true,
    });

    const result2 = await send("<b>Bold test</b> from <code>createRelay()</code>");
    console.log("Result:", result2);

    if (!result2.success) {
        console.error("❌ createRelay() failed:", result2.error);
        process.exit(1);
    }
    console.log("✅ createRelay() passed — message ID:", result2.messageId, "\n");

    // Test 3: Missing message (should still send empty-ish message)
    console.log("── Test 3: relay() with empty string ──");
    const result3 = await relay("");
    console.log("Result:", result3);
    // Telegram rejects empty messages, so this should fail gracefully
    if (!result3.success) {
        console.log("✅ Empty message rejected as expected:", result3.error, "\n");
    } else {
        console.log("⚠️  Empty message was accepted by Telegram\n");
    }

    console.log("🎉 All tests done!");
}

main().catch((err) => {
    console.error("💥 Fatal error:", err.message);
    process.exit(1);
});
