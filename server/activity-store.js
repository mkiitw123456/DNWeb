import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { firestore } from "./store.js";
let queue = Promise.resolve();
function documentPath(key) {
  // Mirror Firestore path validation in the local adapter too.
  if (
    typeof key !== "string" ||
    key.split("/").some((part) => !part) ||
    key.split("/").length % 2 !== 1
  )
    throw new Error("Invalid activity document path");
  return `guild_activity/${key}`;
}
// Independent documents keep growing activity history out of dnweb/state.
export async function activityTransaction(fn, { authenticatedUser } = {}) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const db = await firestore();
    return db.runTransaction(async (tx) => {
      const writes = [];
      if (authenticatedUser) {
        const main = await tx.get(db.doc("dnweb/state"));
        if (
          !main
            .data()
            ?.users?.some(
              (u) =>
                u.id === authenticatedUser.id &&
                u.active &&
                u.version === authenticatedUser.version,
            )
        )
          throw Object.assign(new Error("請重新登入"), { status: 401 });
      }
      const result = await fn({
        quizRecords: async (memberId) =>
          (
            await tx.get(
              db
                .collection("guild_activity/records/ledger")
                .where("memberId", "==", memberId),
            )
          ).docs
            .map((d) => d.data())
            .filter(
              (r) => r.activityId === "quiz" && r.kind === "participation",
            ),
        get: async (key) =>
          (await tx.get(db.doc(documentPath(key)))).data() ?? null,
        set: (key, value) => writes.push([key, value]),
      });
      for (const [key, value] of writes)
        tx.set(db.doc(documentPath(key)), value);
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
    let state = {};
    try {
      state = JSON.parse(await readFile(`${folder}/activities.json`, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    let dirty = false;
    const result = await fn({
      entries: () => Object.entries(structuredClone(state)),
      quizRecords: async (memberId) =>
        Object.entries(state)
          .filter(
            ([k, r]) =>
              k.startsWith("records/ledger/") &&
              r.memberId === memberId &&
              r.activityId === "quiz" &&
              r.kind === "participation",
          )
          .map(([, r]) => structuredClone(r)),
      delete: (key) => {
        documentPath(key);
        delete state[key];
        dirty = true;
      },
      get: async (key) => {
        documentPath(key);
        return structuredClone(state[key] ?? null);
      },
      set: (key, value) => {
        documentPath(key);
        state[key] = value;
        dirty = true;
      },
    });
    if (dirty) {
      await writeFile(`${folder}/activities.tmp`, JSON.stringify(state));
      await rename(`${folder}/activities.tmp`, `${folder}/activities.json`);
    }
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}
export async function activityQuery(
  kind,
  { memberId, before = Number.MAX_SAFE_INTEGER, from = 0, limit = 51 } = {},
) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const db = await firestore();
    // Per-member history and period reports use a single indexed timestamp field.
    const collection = memberId
      ? `guild_activity/member_${memberId}/history`
      : `guild_activity/records/${kind}`;
    const snap = await db
      .collection(collection)
      .where("createdAt", ">=", from)
      .where("createdAt", "<", before)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data());
  }
  await queue;
  let state;
  try {
    state = JSON.parse(
      await readFile(
        `${process.env.LOCAL_DATA_DIR || ".local"}/activities.json`,
        "utf8",
      ),
    );
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const prefix = memberId ? `member_${memberId}/history/` : `records/${kind}/`;
  return Object.entries(state)
    .filter(
      ([key, x]) =>
        key.startsWith(prefix) && x.createdAt >= from && x.createdAt < before,
    )
    .map(([, x]) => x)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
