import { usePostgres, pgTransaction } from "./postgres.js";
import { createHash } from "node:crypto";
import { firestore, readState, transact } from "./store.js";
import { activityTransaction } from "./activity-store.js";
import { removeUser, DEPLOYMENT_TEST } from "./user-deletion.js";
const dayKey = (id, day) =>
  "day_" +
  createHash("sha256")
    .update(JSON.stringify([id, day]))
    .digest("hex");
async function deleteQuery(query) {
  for (;;) {
    const snap = await query.limit(250).get();
    console.info("db_usage cleanup_query", snap.size);
    if (snap.empty) return;
    const batch = snap.docs[0].ref.firestore.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
  }
}
export async function purgeActivityMember(uid) {
  if (!usePostgres() && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const db = await firestore();
    const root = await db.collection("guild_activity").get();
    const days = new Set();
    for (const d of root.docs) {
      const x = d.data();
      if (d.id.startsWith("receipt_") && x.result?.memberId === uid) {
        if (x.result.day) days.add(dayKey(uid, x.result.day));
      }
    }
    // Remove old hashed daily counters before their receipts, making retries safe.
    for (const key of days) await db.doc(`guild_activity/${key}`).delete();
    await deleteQuery(
      db.collection("guild_activity").where("memberId", "==", uid),
    );
    await deleteQuery(
      db.collection("guild_activity").where("result.memberId", "==", uid),
    );
    await deleteQuery(
      db
        .collection("guild_activity/records/ledger")
        .where("memberId", "==", uid),
    );
    await db.recursiveDelete(db.doc(`guild_activity/member_${uid}`));
    for (const d of root.docs.filter((d) => d.id.startsWith("week_"))) {
      await db.runTransaction(async (tx) => {
        const current = await tx.get(d.ref);
        if (current.data()?.members?.[uid]) {
          const value = current.data();
          delete value.members[uid];
          tx.set(d.ref, value);
        }
      });
    }
    // Preserve other members' corrections without a deleted operator identity.
    const operated = await db
      .collection("guild_activity/records/ledger")
      .where("operatorId", "==", uid)
      .get();
    for (const d of operated.docs)
      await d.ref.update({ operatorId: "deleted-account" });
  } else
    await activityTransaction(async (db) => {
      const entries = await db.entries(),
        days = new Set(
          entries
            .filter(
              ([k, x]) =>
                k.startsWith("receipt_") &&
                x.result?.memberId === uid &&
                x.result.day,
            )
            .map(([, x]) => dayKey(uid, x.result.day)),
        );
      for (const [key, value] of entries) {
        if (
          key === `member_${uid}` ||
          key.startsWith(`member_${uid}/history/`) ||
          value.memberId === uid ||
          value.result?.memberId === uid ||
          days.has(key)
        )
          db.delete(key);
        else if (key.startsWith("week_") && value.members?.[uid]) {
          delete value.members[uid];
          db.set(key, value);
        } else if (value.operatorId === uid) {
          value.operatorId = "deleted-account";
          db.set(key, value);
        }
      }
    });
}
let running;
export async function drainUserDeletions() {
  if (running) return running;
  running = (async () => {
    const jobs = await readState((s) => s.pendingUserDeletions || []);
    for (const job of jobs) {
      await purgeActivityMember(job.id);
      if (job.discordId)
        await activityTransaction(async (db) => {
          const voice = await db.get("voice_tracking");
          if (!voice) return;
          delete voice.totals[job.discordId];
          if (voice.textTotals) delete voice.textTotals[job.discordId];
          for (const day of Object.values(voice.days || {}))
            delete day[job.discordId];
          voice.members = (voice.members || []).filter(
            (m) => m.id !== job.discordId,
          );
          db.set("voice_tracking", voice);
        });
      await transact((s) => {
        s.pendingUserDeletions = (s.pendingUserDeletions || []).filter(
          (j) => j.id !== job.id,
        );
      });
    }
  })();
  try {
    await running;
  } finally {
    running = null;
  }
}
let deploymentCleanup;
export function cleanupDeploymentTest() {
  deploymentCleanup ??= runDeploymentCleanup().catch((error) => {
    deploymentCleanup = null;
    throw error;
  });
  return deploymentCleanup;
}
async function runDeploymentCleanup() {
  const complete = await readState(
    (s) => s.deploymentTestCleanupV1 && !s.pendingUserDeletions?.length,
  );
  if (complete) return;
  const needed = await transact((s) => {
    if (s.deploymentTestCleanupV1) return !!s.pendingUserDeletions?.length;
    const target = s.users.find((u) => u.id === DEPLOYMENT_TEST.id);
    if (target) removeUser(s, null, DEPLOYMENT_TEST, { migration: true });
    s.deploymentTestCleanupV1 = true;
    return !!target;
  });
  if (needed) await drainUserDeletions();
}
// Advance one bounded page per maintenance run. New receipts already carry expiry.
async function migrateLegacyHistory(db) {
  const marker = db.doc("dnweb_maintenance/activity_history_v1");
  const state = (await marker.get()).data() || { phase: "member_" };
  if (state.phase === "done") return;
  const { FieldPath } = await import("firebase-admin/firestore");
  let query = db.collection("guild_activity").orderBy(FieldPath.documentId());
  query = state.cursor ? query.startAfter(state.cursor) : query.startAt(state.phase);
  const page = await query.endAt(state.phase + "\uf8ff").limit(50).get();
  console.info("db_usage legacy_cleanup", state.phase, page.size);
  for (const doc of page.docs) {
    if (state.phase === "member_") {
      await deleteQuery(doc.ref.collection("history"));
      continue;
    }
    const { result, expiresAt } = doc.data();
    if (expiresAt || !["participation", "bonus"].includes(result?.kind) || !Number.isFinite(result.createdAt)) continue;
    const expiry = result.createdAt + 35 * 86400000;
    await db.runTransaction(async tx => {
      const daily = result.memberId && result.day
        ? await tx.get(db.doc("guild_activity/" + dayKey(result.memberId, result.day))) : null;
      const receipt = await tx.get(doc.ref);
      if (receipt.exists && !receipt.get("expiresAt")) tx.update(doc.ref, { expiresAt: expiry });
      if (daily?.exists && !daily.get("expiresAt")) tx.update(daily.ref, { expiresAt: expiry });
    });
  }
  await marker.set(page.size === 50
    ? { phase: state.phase, cursor: page.docs.at(-1).id }
    : { phase: state.phase === "member_" ? "receipt_" : "done" });
}

let maintenanceAt = 0;
export async function compactActivityHistory(now = Date.now()) {
  if (now - maintenanceAt < 3600000) return;
  maintenanceAt = now;
  const shouldRun = await transact((s) => {
    if (now - (s.activityMaintenanceAt || 0) < 3600000) return false;
    s.activityMaintenanceAt = now;
    return true;
  });
  if (!shouldRun) return;
  const cutoff = now - 35 * 86400000;
  if (usePostgres()) {
    await pgTransaction(c => c.query(`
      delete from documents where starts_with(path,'guild_activity/') and (
        (body->>'expiresAt')::numeric < $1 or
        (parent='guild_activity/records/ledger' and (body->>'createdAt')::numeric < $2) or
        parent like 'guild_activity/member%/history' or
        (starts_with(path,'guild_activity/receipt_') and body#>>'{result,kind}' in ('participation','bonus')
          and (body#>>'{result,createdAt}')::numeric < $2)
      )`, [now,cutoff]));
    return;
  }
  if (!usePostgres() && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const db = await firestore();
    await deleteQuery(
      db
        .collection("guild_activity/records/ledger")
        .where("createdAt", "<", cutoff),
    );
    await deleteQuery(
      db.collection("guild_activity").where("expiresAt", "<", now),
    );
    await migrateLegacyHistory(db);
  } else
    await activityTransaction(async (db) => {
      for (const [key, x] of await db.entries())
        if (
          key.includes("/history/") ||
          (key.startsWith("records/ledger/") && x.createdAt < cutoff) ||
          (x.expiresAt && x.expiresAt < now) ||
          (key.startsWith("receipt_") &&
            ["participation", "bonus"].includes(x.result?.kind) &&
            x.result.createdAt < cutoff)
        )
          db.delete(key);
    });
  maintenanceAt = now;
}
