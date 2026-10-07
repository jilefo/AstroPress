import { definePlugin } from "@astropress/core";

/**
 * AI Chat Assistant — embeds web-version AI chatbots (DeepSeek, Yuanbao,
 * Qwen, Doubao, Zhipu) into the admin editor via browser automation.
 *
 * NOT API mode: the plugin automates the actual chat websites using a
 * persistent Playwright browser session. Users log in once on the site
 * (e.g. chat.deepseek.com), and the plugin sends prompts / reads replies
 * through the web interface — no API key required.
 *
 * Admin page: /admin-ext/ai-chat
 * API:        /admin-ext/api/ai-chat/*
 *
 * Zero core modification.
 */
export default definePlugin({
  name: "ai-chat",
  version: "0.1.0",
  description:
    "AI chat assistant for content generation. Automates web-version chatbots (DeepSeek, Yuanbao, Qwen, Doubao, Zhipu) via Playwright — no API key needed. Zero core modification.",

  register() {
    // No registry side effects — everything lives in the Astro integration.
  },
});
