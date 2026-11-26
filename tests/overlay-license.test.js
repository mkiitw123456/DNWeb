import { test } from "node:test";
import assert from "node:assert/strict";
import { activateLicense, manageLicenses } from "../server/licenses.js";

test("only current administrators may list, issue or annotate device licenses", () => {
  const state = { users: [{id: "a", active: true, version: 1, admin: true}, {id: "b", active: true, version: 1}] };
  const admin = {id: "a", version: 1};
  for (const type of ["license.create", "license.note", "license.list"]) {
    assert.throws(() => manageLicenses(state, {id:"b",version:1}, type, {}), {status:403});
    assert.throws(() => manageLicenses(state, {id:"a",version:0}, type, {}), {status:401});
  }
  const { licenses: [issued] } = manageLicenses(state, admin, "license.create", {note:"Alice"});
  assert.equal(issued.activatedAt, null);
  const device = "A".repeat(64);
  assert.throws(() => activateLicense(state, {code:"bad",device}), {status:404});
  activateLicense(state, {code:issued.code, device});
  const time = state.overlayLicenses[0].activatedAt;
  assert.ok(time);
  activateLicense(state, {code:issued.code,device});
  assert.throws(() => activateLicense(state, {code:issued.code,device:"B".repeat(64)}), {status:409});
  assert.deepEqual(manageLicenses(state,admin,"license.note",{code:issued.code,note:"Bob"}).licenses,
    [{code:issued.code,note:"Bob",activatedAt:time}]);
});
