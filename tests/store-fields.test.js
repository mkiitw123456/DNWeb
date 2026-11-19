import test from "node:test";
import assert from "node:assert/strict";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { firestoreFieldUpdates } from "../server/store.js";

test("guild writes replace only changed root fields and delete literal field paths", () => {
  const before = {
    users: [{ id: "a" }],
    settings: { keep: 1, oldOption: true },
    "retired.field": { old: 1 },
    createdAt: Timestamp.fromMillis(123),
  };
  const after = {
    users: [{ id: "a" }],
    settings: { keep: 1 },
    createdAt: Timestamp.fromMillis(123),
    "new.field": null,
  };
  const types = { FieldPath, FieldValue };
  const updates = firestoreFieldUpdates(before, after, types);
  assert.equal(updates.length, 6);
  assert.ok(updates[0].isEqual(new FieldPath("settings")));
  assert.deepEqual(updates[1], { keep: 1 });
  assert.ok(updates[2].isEqual(new FieldPath("retired.field")));
  assert.ok(!updates[2].isEqual(new FieldPath("retired", "field")));
  assert.ok(updates[3].isEqual(FieldValue.delete()));
  assert.ok(updates[4].isEqual(new FieldPath("new.field")));
  assert.equal(updates[5], null);
  assert.deepEqual(firestoreFieldUpdates(after, { ...after }, types), []);
});
