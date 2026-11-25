import { usePostgres, pgTransaction, guildDoc, putDoc } from "./postgres.js";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { initialState } from "./domain.js";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
let queue = Promise.resolve(),
  db;
export function assertSourceWritable(state) {
  if (state?.ddstarStorageFrozen) throw Object.assign(new Error("資料庫切換中，請稍後重試"),{status:503});
}
export async function firestore() {
  if (!db) {
    const { initializeApp, cert, getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    if (!getApps().length)
      initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      });
    db = getFirestore();
  }
  return db;
}
async function localState(folder) {
  try {
    return JSON.parse(await readFile(`${folder}/state.json`, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return initialState();
    throw error;
  }
}
// An authorization lookup only needs a fresh snapshot. Using a transaction
// here would contend with writes to the shared guild document.
export async function readState(select) {
  if (usePostgres()) return pgTransaction(async c => select(await guildDoc(c)));
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const snap = await (await firestore()).doc("dnweb/state").get();
    return select(snap.exists ? snap.data() : initialState());
  }
  if (process.env.VERCEL)
    throw Object.assign(new Error("尚未設定 Firebase 服務帳戶"), {
      status: 503,
    });
  await queue;
  return select(await localState(process.env.LOCAL_DATA_DIR || ".local"));
}
export function firestoreFieldUpdates(
  before,
  after,
  { FieldPath, FieldValue },
) {
  const updates = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!Object.hasOwn(after, key)) {
      updates.push(new FieldPath(key), FieldValue.delete());
    } else if (
      !Object.hasOwn(before, key) ||
      !isDeepStrictEqual(before[key], after[key])
    ) {
      // A whole field is replaced, including removed keys inside a nested map.
      updates.push(new FieldPath(key), after[key]);
    }
  }
  return updates;
}
export async function transact(fn, { backup = false } = {}) {
  const backupId = backup
    ? `before-account-cleanup-${Date.now()}-${randomUUID()}`
    : null;
  if (usePostgres()) return pgTransaction(async c => {
    const state = await guildDoc(c), original = structuredClone(state);
    const result = await fn(state);
    if (backup) await putDoc(c, "dnweb_backups/" + backupId, original);
    const removed = Object.keys(original).filter(key => !Object.hasOwn(state, key));
    const changed = Object.fromEntries(Object.entries(state).filter(([key, value]) =>
      !isDeepStrictEqual(original[key], value)));
    if (removed.length || Object.keys(changed).length) {
      await c.query("update documents set body = (body - $1::text[]) || $2::jsonb where path='dnweb/state'",
        [removed, JSON.stringify(changed)]);
    }
    return result;
  });
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const fieldTypes = await import("firebase-admin/firestore");
    const ref = (await firestore()).doc("dnweb/state");
    return ref.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = snap.exists ? snap.data() : initialState();
      // Snapshot.data() decodes a fresh object with native Firestore types.
      const original = snap.exists
        ? snap.data()
        : backup
          ? structuredClone(state)
          : null;
      assertSourceWritable(state);
      const result = await fn(state);
      if (backup)
        tx.create(ref.firestore.doc(`dnweb_backups/${backupId}`), original);
      if (!snap.exists) {
        tx.set(ref, state);
      } else {
        const updates = firestoreFieldUpdates(original, state, fieldTypes);
        if (updates.length) tx.update(ref, ...updates);
      }
      return result;
    });
  }
  if (process.env.VERCEL)
    throw Object.assign(new Error("尚未設定 Firebase 服務帳戶"), {
      status: 503,
    });
  const operation = queue.then(async () => {
    const folder = process.env.LOCAL_DATA_DIR || ".local";
    await mkdir(folder, { recursive: true });
    const state = await localState(folder);
    const original = backup ? JSON.stringify(state) : null;
    const result = await fn(state);
    if (backup)
      await writeFile(`${folder}/${backupId}.json`, original, { flag: "wx" });
    await writeFile(`${folder}/state.tmp`, JSON.stringify(state));
    await rename(`${folder}/state.tmp`, `${folder}/state.json`);
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}
