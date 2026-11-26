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
  zoomTank,
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

test("changing the raster size preserves the orbit, framing and relative rim width", () => {
  for (const yaw of [-0.53, 1.6, Math.PI]) {
    const camera = tankCamera(yaw, 0.42);
    const larger = tankCamera(yaw, 0.42, tankWidth * 3, tankHeight * 3);
    for (const corner of [[-tankHalfLength, 0, 42], [tankHalfLength, 99, -42], [60, 135, -20]]) {
      const [x, y, z] = project(camera, corner);
      const [sx, sy, sz] = project(larger, corner);
      assert.ok(Math.abs(sx - 3 * x) < 1e-9 && Math.abs(sy - 3 * y) < 1e-9);
      assert.equal(z, sz);
    }
    const doubled = tankCamera(yaw, 0.42, tankWidth * 2, tankHeight * 2);
    assert.ok(Math.abs(doubled.strokeWidth / 2 - larger.strokeWidth / 3) < 1e-9);
  }
});

test("wheel zoom holds the fish under the pointer and bounds the overview and close-up", () => {
  const camera = tankCamera(), point = [80, 34, 15];
  const [x, y] = project(camera, point);
  const near = zoomTank(camera, 1.8, x / tankWidth, y / tankHeight);
  const [anchoredX, anchoredY] = project(near, point);
  assert.ok(Math.abs(anchoredX - x) < 1e-9 && Math.abs(anchoredY - y) < 1e-9);
  const orbit = tankCamera(1.2, 0.3, 2 * tankWidth, 2 * tankHeight, near);
  assert.equal(orbit.zoom, near.zoom);
  assert.equal(orbit.offsetX, near.offsetX);
  const far = zoomTank(near, 0.01);
  assert.equal(far.zoom, 0.7);
  assert.equal(Math.abs(far.offsetX) + Math.abs(far.offsetY), 0);
  assert.equal(zoomTank(far, 0.5), far);
  const closest = zoomTank(far, 100);
  assert.equal(closest.zoom, 3);
  assert.equal(zoomTank(closest, 2), closest);
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
