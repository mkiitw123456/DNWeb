import test from "node:test";
import assert from "node:assert/strict";
import { wheelProgress } from "../src/wheel-motion.js";
test("Wheel trajectory is monotonic, bounded, smooth at phase boundaries and settles exactly", () => {
  for (const a of [0.18, 0.24, 0.29])
    for (const c of [0.08, 0.12, 0.16]) {
      assert.equal(wheelProgress(0, a, c), 0);
      assert.ok(Math.abs(wheelProgress(1, a, c) - 1) < 1e-12);
      let prior = 0;
      for (let i = 1; i <= 10000; i++) {
        const p = wheelProgress(i / 10000, a, c);
        assert.ok(p >= prior - 1e-12 && p <= 1 + 1e-12);
        prior = p;
      }
      const h = 1e-6;
      for (const t of [a, a + c]) {
        const before =
          (wheelProgress(t, a, c) - wheelProgress(t - h, a, c)) / h;
        const after = (wheelProgress(t + h, a, c) - wheelProgress(t, a, c)) / h;
        assert.ok(Math.abs(before - after) < 1e-5);
      }
      assert.ok(wheelProgress(h, a, c) / h < 1e-5);
      assert.ok((1 - wheelProgress(1 - h, a, c)) / h < 1e-5);
    }
});
