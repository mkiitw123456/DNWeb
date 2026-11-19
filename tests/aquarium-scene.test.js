import assert from "node:assert/strict";
import test from "node:test";
import { makeSchool, paintTank } from "../src/aquariumScene.js";

function fishPositions(school, seconds) {
  const positions = [];
  const context = {
    clearRect() {},
    drawImage() {},
    fillRect() {},
    save() {},
    restore() {},
    scale() {},
    translate(x, y) {
      positions.push([x, y]);
    },
  };
  paintTank(context, null, school, seconds);
  return positions;
}

test("the first two November fish visibly swim in the first second and keep their routes when a fish joins", () => {
  const school = makeSchool(2, "2026-11");
  const initial = fishPositions(school, 0);
  const after = fishPositions(school, 1);
  assert.equal(after.length, 2);
  for (const [index, [x]] of after.entries())
    assert.ok(
      Math.abs(x - initial[index][0]) >= 4,
      "body moved at least four sprite pixels",
    );
  assert.deepEqual(
    fishPositions(makeSchool(3, "2026-11"), 1).slice(0, 2),
    after,
  );
});
