import { test } from "node:test";
import assert from "node:assert/strict";
import { action, initialState, publicState, reset } from "../server/domain.js";
import { isRelated } from "../src/filters.js";
process.env.INITIAL_ADMIN_PASSWORD = "feature-test";
test("legacy state migration and profession CRUD preserve characters and enforce admin access", () => {
  const s = initialState(),
    admin = s.users[0];
  delete s.professions;
  reset(s);
  assert.deepEqual(s.professions, []);
  action(s, admin, "user.save", { username: "Member", password: "test" });
  const member = s.users[1];
  assert.throws(
    () =>
      action(s, member, "profession.save", { name: "戰士", color: "#ff8800" }),
    { status: 403 },
  );
  assert.throws(() =>
    action(s, admin, "profession.save", { name: "戰士", color: "red" }),
  );
  action(s, admin, "profession.save", { name: "戰士", color: "#FF8800" });
  const profession = s.professions[0];
  assert.equal(profession.color, "#ff8800");
  assert.throws(() =>
    action(s, admin, "profession.save", { name: "戰士", color: "#ffffff" }),
  );
  action(s, member, "character.save", {
    name: "角色",
    hp: 50,
    fatigue: 700,
    attack: 60,
    professionId: profession.id,
  });
  const c = s.characters[0];
  assert.equal(c.professionId, profession.id);
  assert.throws(() =>
    action(s, member, "character.save", { ...c, professionId: "missing" }),
  );
  action(s, admin, "profession.save", {
    ...profession,
    name: "劍士",
    color: "#00ffaa",
  });
  const view = publicState(s, member);
  assert.equal(
    view.professions.find((p) => p.id === c.professionId).color,
    "#00ffaa",
  );
  assert.throws(
    () => action(s, member, "profession.delete", { id: profession.id }),
    { status: 403 },
  );
  action(s, admin, "profession.delete", { id: profession.id });
  assert.equal(s.characters[0].professionId, "");
  assert.equal(s.characters[0].hp, 50);
  assert.equal(s.characters.length, 1);
});
test("cost notes survive sale, edit, claiming and history; old records remain compatible", () => {
  const s = initialState(),
    u = s.users[0];
  action(s, u, "listing.save", {
    name: "道具",
    price: 1000,
    cost: 100,
    costNote: "  封印費\n材料費  ",
    taxed: true,
    participants: [u.id],
  });
  const listing = s.listings[0];
  assert.equal(listing.costNote, "封印費\n材料費");
  action(s, u, "listing.save", { ...listing, costNote: "" });
  assert.equal(listing.costNote, "");
  action(s, u, "listing.save", { ...listing, costNote: "手續費" });
  const settlementId = action(s, u, "listing.sell", { id: listing.id });
  const settlement = s.settlements[0];
  assert.equal(settlement.costNote, "手續費");
  assert.ok(settlement.completedAt);
  action(s, u, "settlement.claim", { id: settlementId, userId: u.id, claimed: false });
  action(s, u, "settlement.edit", {
    id: settlementId,
    name: "道具",
    price: 1000,
    cost: 100,
    costNote: "補充：封印費",
    taxed: true,
  });
  action(s, u, "settlement.claim", { id: settlementId, userId: u.id });
  assert.ok(settlement.completedAt);
  assert.equal(settlement.costNote, "補充：封印費");
  assert.throws(() =>
    action(s, u, "listing.save", {
      name: "bad",
      price: 100,
      cost: 1,
      taxed: true,
      participants: [u.id],
      costNote: "x".repeat(301),
    }),
  );
  action(s, u, "listing.save", {
    name: "舊格式",
    price: 10,
    cost: 0,
    taxed: false,
    participants: [u.id],
  });
  assert.equal(s.listings[1].costNote, "");
});
test("related filters include creator or participant, including archived settlements", () => {
  assert.equal(
    isRelated({ ownerId: "me", participants: ["other"] }, "me"),
    true,
  );
  assert.equal(
    isRelated({ ownerId: "other", participants: ["me"] }, "me"),
    true,
  );
  assert.equal(
    isRelated(
      { ownerId: "other", payouts: [{ userId: "me" }], completedAt: 1 },
      "me",
    ),
    true,
  );
  assert.equal(
    isRelated({ ownerId: "other", payouts: [{ userId: "other" }] }, "me"),
    false,
  );
});
