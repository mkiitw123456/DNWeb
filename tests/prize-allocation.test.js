import test from "node:test";
import assert from "node:assert/strict";
import { allocatePool, allocatePlaces } from "../server/prize-allocation.js";

test("Prediction pool distributes all 150 tokens among winning stakes 40 and 30", () => {
  assert.deepEqual(
    allocatePool(150, [
      { id: "A", weight: 40 },
      { id: "B", weight: 30 },
    ]),
    [
      { id: "A", amount: 86 },
      { id: "B", amount: 64 },
    ],
  );
});
test("Small pool rounding is exact and independent of entry order", () => {
  const shares = [
    { id: "C", weight: 1 },
    { id: "A", weight: 1 },
    { id: "B", weight: 1 },
  ];
  const result = allocatePool(2, shares);
  assert.equal(
    result.reduce((n, s) => n + s.amount, 0),
    2,
  );
  assert.deepEqual(result, allocatePool(2, [...shares].reverse()).reverse());
});
test("Invalid stakes, duplicate members and overallocated places are rejected", () => {
  for (const weight of [-1, 0.5, NaN, Infinity])
    assert.throws(() => allocatePool(100, [{ id: "A", weight }]));
  assert.throws(() => allocatePool(100, [{ id: "A", weight: 0 }]));
  assert.throws(() =>
    allocatePool(100, [
      { id: "A", weight: 1 },
      { id: "A", weight: 2 },
    ]),
  );
  assert.throws(() => allocatePlaces(1000, [55, 35, 20]), /100%/);
});
test("Exact integer arithmetic preserves even large pools and zero-weight entries", () => {
  const rows = allocatePool(Number.MAX_SAFE_INTEGER, [
    { id: "A", weight: Number.MAX_SAFE_INTEGER },
    { id: "B", weight: 5 },
    { id: "C", weight: 0 },
  ]);
  assert.equal(
    rows.reduce((n, s) => n + s.amount, 0),
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(rows[2].amount, 0);
});
