import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { initialState } from "./domain.js";
let queue = Promise.resolve(),
  db;
async function firestore() {
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
export async function transact(fn) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const ref = (await firestore()).doc("dnweb/state");
    return ref.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = snap.exists ? snap.data() : initialState();
      const result = await fn(state);
      tx.set(ref, state);
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
    let state;
    try {
      state = JSON.parse(await readFile(`${folder}/state.json`, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      state = initialState();
    }
    const result = await fn(state);
    await writeFile(`${folder}/state.tmp`, JSON.stringify(state));
    await rename(`${folder}/state.tmp`, `${folder}/state.json`);
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}
