import test from "node:test";
import assert from "node:assert/strict";
import { fetchGuildEmojis } from "../server/emojis.js";
test("emoji lookup handles guild access failure and normalizes trusted Discord data", async () => {
  const original = globalThis.fetch,
    token = process.env.DISCORD_BOT_TOKEN;
  process.env.DISCORD_BOT_TOKEN = "test-token";
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(
        url,
        "https://discord.com/api/v10/guilds/418022714423508992/emojis",
      );
      assert.equal(options.headers.Authorization, "Bot test-token");
      return { ok: false, status: 404 };
    };
    await assert.rejects(fetchGuildEmojis("418022714423508992"), /尚未加入/);
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [
        { name: "Swordsman", id: "1570037315982721054", animated: false },
        { name: "Gone", id: "1570037315982721055", available: false },
      ],
    });
    assert.deepEqual(await fetchGuildEmojis("418022714423508992"), [
      { name: "Swordsman", id: "1570037315982721054", animated: false },
    ]);
  } finally {
    globalThis.fetch = original;
    if (token === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = token;
  }
});
