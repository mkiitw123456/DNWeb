import { test } from "node:test";
import assert from "node:assert/strict";
import { action } from "../server/domain.js";

const soldAt = 1770000000000;
const claimedAt = soldAt + 1000;

function fixture() {
  return {
    users: [
      { id: "seller", username: "Seller", active: true, admin: true },
      { id: "me", username: "Member", active: true, admin: false },
      { id: "peer", username: "Peer", active: true, admin: false },
    ],
    characters: [],
    professions: [],
    dungeons: [],
    listings: [],
    settlements: [],
  };
}

function sale(s, price, participants) {
  const seller = s.users[0];
  action(
    s,
    seller,
    "listing.save",
    {
      name: "公會物品",
      price,
      cost: 0,
      taxed: false,
      participants,
    },
    soldAt,
  );
  const settlementId = action(
    s,
    seller,
    "listing.sell",
    {
      id: s.listings.at(-1).id,
    },
    soldAt,
  );
  return s.settlements.find((item) => item.id === settlementId);
}

function own(item, userId = "me") {
  return item.payouts.find((payout) => payout.userId === userId);
}

function snapshot(items, userId = "me") {
  return items.map((item) => ({
    id: item.id,
    amount: own(item, userId).amount,
  }));
}

test("bulk claim settles the confirmed own total and archives only fully claimed sales", () => {
  const s = fixture();
  const finished = sale(s, 200, ["seller", "me"]);
  const waiting = sale(s, 303, ["seller", "me", "peer"]);
  const claims = snapshot([finished, waiting]);
  assert.equal(
    claims.reduce((sum, item) => sum + item.amount, 0),
    201,
  );

  action(s, s.users[1], "settlement.claimAll", { claims }, claimedAt);

  assert.equal(own(finished).claimedAt, claimedAt);
  assert.equal(own(waiting).claimedAt, claimedAt);
  assert.equal(finished.completedAt, claimedAt);
  assert.equal(waiting.completedAt, null);
  assert.equal(own(waiting, "peer").claimedAt, null);
  assert.equal(own(finished, "seller").claimedAt, soldAt);
});

test("bulk claim always uses the logged-in member, even for forged admin payloads", () => {
  for (const admin of [false, true]) {
    const s = fixture();
    s.users[1].admin = admin;
    const item = sale(s, 300, ["seller", "me", "peer"]);
    action(
      s,
      s.users[1],
      "settlement.claimAll",
      {
        claims: snapshot([item]).map((claim) => ({ ...claim, userId: "peer" })),
        userId: "peer",
      },
      claimedAt,
    );
    assert.equal(own(item).claimedAt, claimedAt);
    assert.equal(own(item, "peer").claimedAt, null);
  }
});

test("stale, deleted, or no-longer-owned claims reject the entire batch before mutation", () => {
  for (const change of ["amount", "deleted", "participant"]) {
    const s = fixture();
    const first = sale(s, 200, ["seller", "me"]);
    const second = sale(s, 400, ["seller", "me"]);
    const claims = snapshot([first, second]);
    if (change === "amount") own(second).amount += 1;
    if (change === "deleted")
      s.settlements = s.settlements.filter((item) => item.id !== second.id);
    if (change === "participant") own(second).userId = "peer";
    const before = structuredClone(s.settlements);

    assert.throws(
      () => action(s, s.users[1], "settlement.claimAll", { claims }, claimedAt),
      {
        status: 409,
        message: /重新整理/,
      },
    );
    assert.deepEqual(s.settlements, before);
    assert.equal(own(first).claimedAt, null);
  }
});

test("bulk claim validates nonempty unique IDs and safe nonnegative integer amounts", () => {
  const s = fixture();
  const item = sale(s, 200, ["seller", "me"]);
  const valid = snapshot([item])[0];
  const invalidClaims = [
    undefined,
    {},
    [],
    [null],
    [[]],
    [valid, valid],
    [{ ...valid, id: "" }],
    [{ ...valid, id: ` ${valid.id}` }],
    [{ ...valid, id: 42 }],
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "100"].map(
      (amount) => [{ ...valid, amount }],
    ),
  ];
  for (const claims of invalidClaims) {
    assert.throws(
      () => action(s, s.users[1], "settlement.claimAll", { claims }, claimedAt),
      {
        status: 400,
      },
    );
    assert.equal(own(item).claimedAt, null);
  }
});

test("repeated bulk confirmations skip already claimed payouts and preserve all timestamps", () => {
  const s = fixture();
  const earlier = sale(s, 200, ["seller", "me"]);
  const later = sale(s, 400, ["seller", "me"]);
  const claims = snapshot([earlier, later]);
  action(
    s,
    s.users[1],
    "settlement.claim",
    {
      id: earlier.id,
      userId: "me",
    },
    claimedAt - 500,
  );
  action(s, s.users[1], "settlement.claimAll", { claims }, claimedAt);
  assert.equal(earlier.completedAt, claimedAt - 500);
  assert.equal(later.completedAt, claimedAt);
  const before = structuredClone(s.settlements);

  action(
    s,
    s.users[1],
    "settlement.claimAll",
    {
      claims: claims.map((claim) => ({ ...claim, amount: claim.amount + 1 })),
    },
    claimedAt + 1000,
  );
  assert.deepEqual(s.settlements, before);
});

test("new sales after the confirmation snapshot remain unclaimed", () => {
  const s = fixture();
  const old = sale(s, 200, ["seller", "me"]);
  const claims = snapshot([old]);
  const newSale = sale(s, 400, ["seller", "me"]);

  action(s, s.users[1], "settlement.claimAll", { claims }, claimedAt);

  assert.equal(old.completedAt, claimedAt);
  assert.equal(own(newSale).claimedAt, null);
  assert.equal(newSale.completedAt, null);
});

test("zero-amount payouts can be confirmed and completed", () => {
  const s = fixture();
  const item = sale(s, 0, ["seller", "me"]);
  const claims = snapshot([item]);
  assert.equal(claims[0].amount, 0);

  action(s, s.users[1], "settlement.claimAll", { claims }, claimedAt);

  assert.equal(own(item).claimedAt, claimedAt);
  assert.equal(item.completedAt, claimedAt);
});
