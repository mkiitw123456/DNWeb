import assert from "node:assert/strict";
import test from "node:test";
import {
  fishPose,
  makeSchool,
  project,
  reconcileSchool,
  tankCamera,
  tankHalfLength,
  tankHeight,
  tankWidth,
} from "../src/aquariumScene.js";

const day = "2026-11-25";
const update = (prior, count, t, playing = true, date = day) =>
  reconcileSchool(prior, count, date, 24, t, playing);

test("orbit keeps the glass and incoming fish in frame and reverses depth from behind", () => {
  const front = [30, 42, 35],
    back = [30, 42, -35];
  const camera = tankCamera(0);
  assert.ok(project(camera, front)[2] > project(camera, back)[2]);
  assert.ok(
    project(tankCamera(Math.PI), front)[2] <
      project(tankCamera(Math.PI), back)[2],
  );
  assert.deepEqual(
    project(tankCamera(2 * Math.PI), front),
    project(camera, front),
  );
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
    for (const pitch of [-1, 0.2, 0.7, 2]) {
      for (const x of [-tankHalfLength, tankHalfLength])
        for (const z of [-42, 42])
          for (const y of [-4, 135]) {
            const [sx, sy] = project(tankCamera(angle, pitch), [x, y, z]);
            assert.ok(sx >= 0 && sx < tankWidth && sy >= 0 && sy < tankHeight);
          }
    }
  }
});

test("default perspective shows the near end larger and the long side receding", () => {
  const camera = tankCamera();
  const heightAt = (x) =>
    project(camera, [x, 0, 42])[1] - project(camera, [x, 99, 42])[1];
  assert.ok(heightAt(-tankHalfLength) > 1.2 * heightAt(tankHalfLength));
  const near = project(camera, [-tankHalfLength, 1, 42]);
  const far = project(camera, [tankHalfLength, 1, 42]);
  assert.ok(far[0] > near[0] && far[1] < near[1]);
});

test("resident fish keep their 3D routes and newcomers enter above the surface", () => {
  const initial = update(null, 3, 0);
  assert.equal(initial.arrivals.size, 0);
  assert.notDeepEqual(
    fishPose(initial.fish[0], 0),
    fishPose(initial.fish[0], 1),
  );
  const joined = update(initial, 4, 2);
  assert.deepEqual(joined.fish.slice(0, 3), initial.fish);
  assert.deepEqual([...joined.arrivals], [[3, 2]]);
  const newcomer = joined.fish[3],
    pose = (t) => fishPose(newcomer, t, 2);
  assert.ok(pose(2).y > 94);
  assert.ok(Math.abs(pose(2.58).y - 94) < 1e-9);
  assert.ok(pose(3).y < 94);
  assert.deepEqual(pose(4), fishPose(newcomer, 4));
  assert.deepEqual([...update(joined, 4, 2.5).arrivals], [[3, 2]]);
  assert.equal(update(joined, 3, 2.5).arrivals.size, 0);
});

test("batch joins, full tank, pause, reload and Taipei day change", () => {
  const batch = update(update(null, 0, 0), 3, 1);
  assert.ok(batch.arrivals.get(2) > batch.arrivals.get(0));
  const residents = update(null, 24, 0);
  const full = update(residents, 25, 3);
  assert.equal(full.fish.length, 24);
  assert.deepEqual([...full.arrivals], [[0, 3]]);
  const next = update(full, 27, 3.2);
  assert.deepEqual([...next.arrivals.keys()], [0, 1, 2]);
  assert.deepEqual(next.fish.slice(3), residents.fish.slice(3));
  const rollback = update(full, 24, 3.2);
  assert.equal(rollback.arrivals.size, 0);
  assert.deepEqual(rollback.fish, residents.fish);
  assert.equal(update(batch, 4, 2, false).arrivals.size, 0);
  assert.equal(update(null, 8, 0).arrivals.size, 0);
  const reset = update(full, 0, 4, true, "2026-11-26");
  assert.deepEqual(reset.fish, []);
  assert.equal(reset.arrivals.size, 0);
  assert.notDeepEqual(makeSchool(1, day), makeSchool(1, "2026-11-26"));
});
