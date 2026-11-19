import { fail, publicState } from "./domain.js";

const collections = new Map([
  ["user.save", "users"],
  ["character.save", "characters"],
  ["dungeon.save", "dungeons"],
  ["profession.save", "professions"],
  ["quantityType.save", "quantityTypes"],
]);
const uuid =
  /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const receiptLimit = 256;
const isUuid = (value) => typeof value === "string" && uuid.test(value);

export function findEditorCreate(state, user, type, payload) {
  const collection = collections.get(type);
  if (!collection || payload.createKey === undefined) return null;
  if (
    payload.id ||
    !isUuid(payload.createKey) ||
    !isUuid(payload.createAttempt) ||
    (payload.credentialInput !== undefined && !isUuid(payload.credentialInput))
  ) {
    fail("建立表單已失效，請重新開啟");
  }
  const previous = (state.editorCreateReceipts || []).find(
    (r) =>
      r.actor === user.id && r.type === type && r.key === payload.createKey,
  );
  if (!previous) return null;
  if (!user.admin && type !== "character.save") fail("僅管理員可操作", 403);
  const record = state[collection].find(
    (entry) => entry.id === previous.recordId,
  );
  if (!record) fail("上次建立的資料已刪除，請關閉表單後再建立", 409);
  if (type === "character.save" && !user.admin && record.ownerId !== user.id)
    fail("沒有修改權限", 403);
  return {
    ...publicState(state, user),
    savedRecordId: record.id,
    savedCreateAttempt: previous.attempt,
    savedCredentialInput: previous.credentialInput,
  };
}

export function rememberEditorCreate(state, user, type, payload, recordId) {
  if (!payload.createKey || !collections.has(type)) return;
  // Only identifiers are retained. Draft text, credentials, and account details
  // never enter the shared bounded receipt list.
  state.editorCreateReceipts = [
    ...(state.editorCreateReceipts || []).slice(1 - receiptLimit),
    {
      actor: user.id,
      type,
      key: payload.createKey,
      attempt: payload.createAttempt,
      credentialInput: payload.credentialInput || null,
      recordId,
    },
  ];
}
