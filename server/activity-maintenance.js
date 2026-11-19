import { createHash } from "node:crypto";
import { firestore, transact } from "./store.js";
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
    if (snap.empty) return;
    const batch = snap.docs[0].ref.firestore.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
  }
}
export async function purgeActivityMember(uid) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
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
      const entries = db.entries(),
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
    const jobs = await transact((s) => s.pendingUserDeletions || []);
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
let migrated = false;
export async function cleanupDeploymentTest() {
  if (migrated) return;
  const needed = await transact((s) => {
    if (s.deploymentTestCleanupV1) return !!s.pendingUserDeletions?.length;
    const target = s.users.find((u) => u.id === DEPLOYMENT_TEST.id);
    if (target) removeUser(s, null, DEPLOYMENT_TEST, { migration: true });
    s.deploymentTestCleanupV1 = true;
    return !!target;
  });
  if (needed) await drainUserDeletions();
  migrated = true;
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
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const db = await firestore();
    await deleteQuery(
      db
        .collection("guild_activity/records/ledger")
        .where("createdAt", "<", cutoff),
    );
    await deleteQuery(
      db.collection("guild_activity").where("expiresAt", "<", now),
    );
    // The former personal-history copies are redundant; reports use the ledger.
    const members = await db.collection("guild_activity").get();
    for (const d of members.docs) {
      const x = d.data();
      if (
        d.id.startsWith("receipt_") &&
        x.result?.kind === "participation" &&
        x.result.createdAt < cutoff
      ) {
        if (x.result.memberId && x.result.day)
          await db
            .doc(`guild_activity/${dayKey(x.result.memberId, x.result.day)}`)
            .delete();
        await d.ref.delete();
      }
    }
    for (const d of members.docs.filter((d) => d.id.startsWith("member_")))
      await deleteQuery(d.ref.collection("history"));
  } else
    await activityTransaction(async (db) => {
      for (const [key, x] of db.entries())
        if (
          key.includes("/history/") ||
          (key.startsWith("records/ledger/") && x.createdAt < cutoff) ||
          (x.expiresAt && x.expiresAt < now) ||
          (key.startsWith("receipt_") &&
            x.result?.kind === "participation" &&
            x.result.createdAt < cutoff)
        )
          db.delete(key);
    });
  maintenanceAt = now;
}
