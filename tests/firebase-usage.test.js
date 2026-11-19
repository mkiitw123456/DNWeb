import test from "node:test";
import assert from "node:assert/strict";
import {
  quotaPeriod,
  readUsage,
  firebaseUsage,
} from "../server/firebase-usage.js";
import { casinoAction } from "../server/casino.js";
import { gameAction } from "../server/guild-games.js";
import { duelAction } from "../server/duels.js";
test("Quota day tracks Pacific midnight and DST days rather than Taiwan midnight", () => {
  assert.equal(
    new Date(
      quotaPeriod(Date.parse("2026-11-19T10:00:00Z")).start,
    ).toISOString(),
    "2026-11-19T08:00:00.000Z",
  );
  assert.equal(
    new Date(
      quotaPeriod(Date.parse("2026-07-19T10:00:00Z")).start,
    ).toISOString(),
    "2026-07-19T07:00:00.000Z",
  );
  const spring = quotaPeriod(Date.parse("2026-03-08T10:00:00Z")),
    fall = quotaPeriod(Date.parse("2026-11-01T10:00:00Z"));
  assert.equal(spring.end - spring.start, 23 * 3600000);
  assert.equal(fall.end - fall.start, 25 * 3600000);
});
test("Monitoring totals paginate; permission and no data never appear as zero", async () => {
  const now = Date.parse("2026-11-19T10:00:00Z");
  const result = await readUsage("demo-project", "secret", now, async (url) => {
    const u = new URL(url),
      filter = u.searchParams.get("filter");
    assert.ok(filter.includes('resource.labels.project_id="demo-project"'));
    if (filter.includes("write_count")) return { ok: false, status: 403 };
    if (filter.includes("delete_count"))
      return { ok: true, json: async () => ({}) };
    return {
      ok: true,
      json: async () => ({
        timeSeries: [
          {
            points: [
              {
                value: {
                  int64Value: u.searchParams.has("pageToken") ? "5" : "10",
                },
                interval: { endTime: "2026-11-19T09:00:00Z" },
              },
            ],
          },
        ],
        ...(u.searchParams.has("pageToken") ? {} : { nextPageToken: "next" }),
      }),
    };
  });
  assert.equal(result.metrics[0].value, 15);
  assert.equal(result.metrics[1].value, null);
  assert.equal(result.metrics[1].status, "permission");
  assert.equal(result.metrics[2].status, "no_data");
  assert.ok(!JSON.stringify(result).includes("secret"));
  await assert.rejects(firebaseUsage({ admin: false }), { status: 403 });
});
test("All casino families reject unbound and only-pending Discord users, including admins", () => {
  for (const fn of [casinoAction, gameAction, duelAction])
    for (const admin of [true, false]) {
      const u = {
        id: "u",
        active: true,
        admin,
        discordId: "",
        discordPendingId: "123456789012345678",
      };
      assert.throws(
        () =>
          fn(
            {},
            u,
            fn === casinoAction
              ? "casino.state"
              : fn === gameAction
                ? "game.state"
                : "duel.state",
          ),
        { status: 403 },
      );
    }
});
