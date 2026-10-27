import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  register,
  action,
  publicState,
  reset,
} from "../server/domain.js";
process.env.INITIAL_ADMIN_PASSWORD = "test";
function fixture() {
  const s = initialState(),
    admin = s.users[0];
  const a = register(s, { username: "A", password: "test" }),
    b = register(s, { username: "B", password: "test" });
  return { s, admin, a, b };
}
test("overlapping groups preserve access until the last common membership is removed", () => {
  const { s, a, b } = fixture();
  action(s, a, "character.save", { name: "A", hp: 0, attack: 0 });
  action(s, a, "group.create", { name: "one" });
  action(s, a, "group.create", { name: "two" });
  for (const g of s.groups) {
    action(s, a, "group.invite", { groupId: g.id, username: b.username });
    action(s, b, "group.respond", { id: s.invitations[0].id, accept: true });
  }
  assert.equal(publicState(s, b).characters.length, 1);
  action(s, b, "group.leave", { groupId: s.groups[0].id });
  assert.equal(publicState(s, b).characters.length, 1);
  assert.throws(() => action(s, b, "group.leave", { groupId: "unknown" }), {
    status: 404,
  });
  action(s, a, "group.kick", { groupId: s.groups[1].id, userId: b.id });
  assert.equal(publicState(s, b).characters.length, 0);
});
test("quantities are admin-defined, owner-editable, persistent across weekly reset and removed with type", () => {
  const { s, admin, a, b } = fixture();
  assert.throws(() => action(s, a, "quantityType.save", { name: "入場券" }), {
    status: 403,
  });
  action(s, admin, "quantityType.save", { name: "入場券" });
  const typeId = s.quantityTypes[0].id;
  action(s, a, "character.save", { name: "hero", hp: 0, attack: 0 });
  const c = s.characters[0];
  action(s, a, "character.quantity", { id: c.id, typeId, quantity: 42 });
  assert.throws(
    () =>
      action(s, b, "character.quantity", { id: c.id, typeId, quantity: 100 }),
    { status: 403 },
  );
  for (const quantity of [-1, 1.5, Infinity, "1", 1e12 + 1])
    assert.throws(() =>
      action(s, a, "character.quantity", { id: c.id, typeId, quantity }),
    );
  reset(s, Date.now() + 15 * 86400000);
  assert.equal(c.quantities[typeId], 42);
  action(s, admin, "quantityType.save", { id: typeId, name: "保留券" });
  assert.equal(c.quantities[typeId], 42);
  action(s, a, "character.save", {
    ...c,
    name: "renamed",
    quantities: { [typeId]: 999 },
  });
  assert.equal(c.quantities[typeId], 42);
  action(s, admin, "quantityType.delete", { id: typeId });
  assert.equal(c.quantities[typeId], undefined);
});
test("item board is public to signed-in users, validates content and restricts modification", () => {
  const { s, admin, a, b } = fixture();
  const draft = {
    name: "寶劍",
    description: "攻擊力 100\n交換材料",
    imageUrl: "https://example.com/image.png",
    status: "available",
  };
  action(s, a, "itemPost.save", { ...draft, ownerId: b.id });
  const post = s.itemPosts[0];
  assert.equal(post.ownerId, a.id);
  assert.equal(publicState(s, b).itemPosts[0].description, draft.description);
  for (const imageUrl of [
    "javascript:alert(1)",
    "data:image/png;base64,xx",
    "http://example.com/a.png",
    "https://drive.google.com/file/d/test/view",
    "https://user:pass@example.com/a.png",
  ])
    assert.throws(() => action(s, a, "itemPost.save", { ...draft, imageUrl }));
  assert.throws(() =>
    action(s, a, "itemPost.save", { ...draft, description: "x".repeat(2001) }),
  );
  assert.throws(
    () => action(s, b, "itemPost.save", { ...post, name: "stolen" }),
    { status: 403 },
  );
  assert.throws(() => action(s, b, "itemPost.delete", { id: post.id }), {
    status: 403,
  });
  action(s, a, "itemPost.save", { ...post, status: "closed" });
  assert.equal(post.status, "closed");
  action(s, admin, "itemPost.delete", { id: post.id });
  assert.equal(s.itemPosts.length, 0);
});
test("legacy iconless professions are removed once without deleting characters", () => {
  const { s, admin, a } = fixture();
  delete s.iconlessProfessionsRemoved;
  s.professions.push(
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `old${i}`,
      name: `old${i}`,
      color: "#ffffff",
    })),
  );
  s.characters.push({
    id: "hero",
    ownerId: a.id,
    name: "hero",
    professionId: "old0",
    runs: {},
  });
  reset(s);
  assert.equal(s.professions.length, 10);
  assert.equal(s.characters[0].professionId, "");
  assert.equal(s.characters.length, 1);
  reset(s);
  assert.equal(s.professions.length, 10);
  assert.throws(() =>
    action(s, admin, "profession.save", { name: "no icon", icon: "" }),
  );
});
test("promotion is separate from cleanup, requires existing admin and preserves other accounts", () => {
  const { s, admin, a } = fixture();
  admin.username = "OriginalAdmin";
  const target = register(s, { username: "MrAirWolf", password: "test" });
  const count = s.users.length;
  assert.throws(() => action(s, target, "maintenance.promoteOwner", {}), {
    status: 403,
  });
  assert.throws(() => action(s, a, "maintenance.promoteOwner", {}), {
    status: 403,
  });
  action(s, admin, "maintenance.promoteOwner", {});
  assert.equal(target.admin, true);
  assert.equal(s.users.length, count);
  assert.equal(s.accountCleanupCompleted, undefined);
});
