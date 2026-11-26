import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activityAction, activityView } from "../server/activities.js";
import { fishById, drawFishSpecies, fishTiers } from "../shared/fish-catalog.js";

let folder;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "dnweb-aquarium-"));
  process.env.LOCAL_DATA_DIR = folder;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
});
after(() => rm(folder, { recursive: true, force: true }));

const users = Array.from({ length: 28 }, (_, i) => ({
  id: `fish-${i}`,
  username: `Fish ${i}`,
  active: true,
}));
const view = (user, now) => activityView(user, users, now);
const checkIn = (user, day, now) =>
  activityAction(user, users, "aquarium.checkIn", { day }, now);

test("same-day requests share one fish across tabs, preserving daily game counts in either order", async () => {
  const now = Date.parse("2026-10-15T12:00:00+08:00");
  const [a, b] = users;
  const initial = await view(a, now);
  const day = initial.aquarium.day;
  const fortune = initial.activities.find((x) => x.id === "fortune");
  const playFortune = (user) =>
    activityAction(
      user,
      users,
      "activity.submit",
      {
        submissionId: crypto.randomUUID(),
        activityId: "fortune",
        version: fortune.version,
        round: 0,
        day,
      },
      now,
    );

  assert.equal(initial.aquarium.fishCount, 0);
  assert.equal(initial.aquarium.checkedInToday, false);
  const results = await Promise.all(
    Array.from({ length: 6 }, () => checkIn(a, day, now)),
  );
  assert.ok(results.every((r) => r.totalCheckIns === 1 && r.checkedInToday));
  const drawn = results[0].todayFish;
  assert.ok(fishById.has(drawn));
  for (const r of results) {
    assert.equal(r.todayFish, drawn);
    assert.deepEqual(r.species, [drawn]);
    assert.deepEqual(r.collection, { [drawn]:1 });
  }
  assert.deepEqual((await view(b, now)).aquarium.collection,{});
  assert.equal((await view(b, now)).aquarium.checkedInToday, false);
  await Promise.all([playFortune(a), playFortune(b)]);
  const retry = await checkIn(a, day, now);
  assert.equal(retry.totalCheckIns, 1);
  assert.deepEqual(retry.collection, results[0].collection);
  assert.equal((await checkIn(b, day, now)).totalCheckIns, 2);
  for (const user of [a, b]) {
    const updated = await view(user, now);
    assert.equal(updated.aquarium.totalCheckIns, 2);
    assert.equal(updated.aquarium.checkedInToday, true);
    assert.equal(updated.activities.find((x) => x.id === "fortune").used, 1);
    assert.equal(updated.member.count, 1);
  }
});

test("09:00 Taiwan resets daily eligibility and starts an empty tank on the first", async () => {
  const beforeReset = Date.parse("2027-01-01T08:59:59+08:00");
  const reset = beforeReset + 1000;
  const [user] = users;
  const december = await checkIn(user, "2026-12-31", beforeReset);
  assert.equal(december.month, "2026-12");
  assert.equal(december.totalCheckIns, 1);
  const january = (await view(user, reset)).aquarium;
  assert.equal(january.day, "2027-01-01");
  assert.equal(january.fishCount, 0);
  assert.equal(january.checkedInToday, false);
  assert.deepEqual(january.collection, december.collection);
  assert.equal(january.todayFish, null);
  await assert.rejects(checkIn(user, december.day, reset), { status: 409 });
  assert.equal((await checkIn(user, january.day, reset)).totalCheckIns, 1);
  const tomorrow = (await view(user, reset + 86400000)).aquarium;
  assert.equal(tomorrow.totalCheckIns, 0);
  assert.equal(tomorrow.checkedInToday, false);
  assert.equal(
    (await checkIn(user, tomorrow.day, reset + 86400000)).totalCheckIns,
    1,
  );
});

test("a full aquarium continues recording participation, including simultaneous sign-ins", async () => {
  const now = Date.parse("2027-08-15T11:00:00+08:00");
  const { day, capacity } = (await view(users[0], now)).aquarium;
  await Promise.all(users.map((user) => checkIn(user, day, now)));
  const full = (await view(users[0], now)).aquarium;
  assert.equal(capacity, 24);
  assert.equal(full.fishCount, capacity);
  assert.equal(full.totalCheckIns, users.length);
  assert.equal(full.species.length,capacity);
  assert.ok(full.species.every(s=>fishById.has(s)));
  assert.deepEqual(await checkIn(users[0], day, now), full);
});

test("cached lobby summaries exclude private fields and roll over at Taipei 09:00", async () => {
  const before = Date.parse("2027-04-01T08:59:59+08:00");
  const [member] = users;
  const summary = now => activityAction(member, users, "activity.summary", {}, now);
  await checkIn(member, "2027-03-31", before);
  const previous = await summary(before);
  assert.deepEqual(Object.keys(previous).sort(), ["day", "leaderboard", "period", "species", "totalCheckIns"]);
  assert.ok(fishById.has(previous.species[0]));
  assert.equal(previous.totalCheckIns, 1);
  const next = await summary(before + 1000);
  assert.equal(next.day, "2027-04-01");
  assert.equal(next.totalCheckIns, 0);
});

test("a hundred rarity tickets have the advertised distribution", () => {
  const counts=fishTiers.map(()=>0);
  for(let i=0;i<100;i++){
    const id=drawFishSpecies(limit=>limit===100?i:0);
    counts[fishById.get(id).tier]++;
  }
  assert.deepEqual(counts, fishTiers.map(t=>t.rate));
});
