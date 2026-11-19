const fields = [
  "activities",
  "fortunes",
  "questions",
  "events",
  "schedule",
  "campaignSchedule",
  "quizCategories",
  "fortuneIntro",
  "fortuneBody",
  "eventUnlimited",
];
const banks = new Set(["activities", "fortunes", "questions", "events"]);
const labels = {
  activities: "活動規則",
  fortunes: "籤文",
  questions: "快問快答",
  events: "冒險事件",
  schedule: "活動日曆",
  campaignSchedule: "劇本檔期",
  quizCategories: "開放分類",
  fortuneIntro: "抽籤標題",
  fortuneBody: "抽籤內文",
  eventUnlimited: "連玩測試",
};
function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
  );
}
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// A text edit in a bank sends only its changed rows. A reorder, addition or
// removal sends that bank in display order; the other banks stay untouched.
export function diffActivityConfig(before, after) {
  const changes = {},
    rows = {};
  for (const field of fields) {
    const old = before[field],
      next = after[field];
    if (same(old, next)) continue;
    if (
      banks.has(field) &&
      Array.isArray(old) &&
      Array.isArray(next) &&
      old.length === next.length &&
      next.every((item, i) => item.id && old[i].id === item.id)
    ) {
      rows[field] = next.filter((item, i) => !same(item, old[i]));
    } else {
      changes[field] = next;
    }
  }
  return { changes, rows };
}

export function applyActivityPatch(base, { changes, rows }) {
  if (
    !object(changes) ||
    !object(rows) ||
    Object.keys(changes).some((k) => !fields.includes(k))
  )
    throw new Error("活動設定欄位無效");
  const result = { ...base, ...changes };
  for (const [field, items] of Object.entries(rows)) {
    if (
      !banks.has(field) ||
      Object.hasOwn(changes, field) ||
      !Array.isArray(items)
    )
      throw new Error("活動題庫更新格式無效");
    const byId = new Map(items.map((item) => [item?.id, item]));
    if (byId.size !== items.length) throw new Error("更新的題目識別碼重複");
    result[field] = base[field].map((item) => {
      if (!byId.has(item.id)) return item;
      const updated = byId.get(item.id);
      byId.delete(item.id);
      return updated;
    });
    if (byId.size) throw new Error("更新的題目已不存在");
  }
  return result;
}

export function rebaseActivityDraft(current, submitted, confirmed) {
  if (current === submitted) return confirmed;
  const draft = { ...confirmed };
  let edited = false;
  for (const field of fields) {
    if (
      current[field] !== submitted[field] &&
      current[field] !== confirmed[field]
    ) {
      draft[field] = current[field];
      edited = true;
    }
  }
  return edited ? draft : confirmed;
}

function conflict(label) {
  throw new Error(
    `「${label}」也被其他管理員修改，無法自動合併。草稿仍保留，請先複製需要的內容，再載入新版核對。`,
  );
}

function mergeValue(base, local, remote, label) {
  if (same(base, local) || same(local, remote)) return remote;
  if (same(base, remote)) return local;
  if ((base === undefined || object(base)) && object(local) && object(remote)) {
    const merged = {};
    for (const key of new Set([
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      const value = mergeValue(
        base?.[key],
        local[key],
        remote[key],
        `${label} / ${key}`,
      );
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  // Nested arrays (e.g. answers and outcomes) have no stable row IDs.
  return conflict(label);
}

function mergeBank(base, local, remote, field) {
  const key = field === "campaignSchedule" ? "startDay" : "id";
  const indexes = [base, local, remote].map((items) => {
    const index = new Map(items.map((item) => [item[key], item]));
    if (index.size !== items.length || [...index.keys()].some((id) => !id))
      conflict(labels[field]);
    return index;
  });
  const [original, mine, theirs] = indexes;
  const rows = new Map();
  for (const id of new Set([...mine.keys(), ...theirs.keys()])) {
    const row = mine.get(id) ?? theirs.get(id);
    const name = row.title || row.question || row.startDay || id;
    const value = mergeValue(
      original.get(id),
      mine.get(id),
      theirs.get(id),
      `${labels[field]} / ${name}`,
    );
    if (value !== undefined) rows.set(id, value);
  }
  const [oldOrder, myOrder, theirOrder] = indexes.map((index) =>
    [...index.keys()].filter((id) => rows.has(id)),
  );
  if (same(oldOrder, myOrder)) return theirOrder.map((id) => rows.get(id));
  if (same(oldOrder, theirOrder)) return myOrder.map((id) => rows.get(id));
  if (
    !same(
      myOrder.filter((id) => theirs.has(id)),
      theirOrder.filter((id) => mine.has(id)),
    )
  )
    conflict(`${labels[field]}順序`);
  // Use shared rows as anchors, keeping each editor's insertions in order.
  const merged = [];
  let remoteIndex = 0;
  let additions = [];
  for (const id of myOrder) {
    if (!theirs.has(id)) {
      additions.push(id);
      continue;
    }
    while (theirOrder[remoteIndex] !== id)
      merged.push(theirOrder[remoteIndex++]);
    merged.push(...additions, id);
    additions = [];
    remoteIndex++;
  }
  return [...merged, ...theirOrder.slice(remoteIndex), ...additions].map((id) =>
    rows.get(id),
  );
}

// Recover from a version conflict using the originally loaded config as the
// common ancestor. A client must not resubmit an old wholesale bank/calendar.
export function mergeActivityConflict(base, local, remote) {
  const result = { ...remote };
  for (const field of fields) {
    const original = base[field],
      mine = local[field],
      theirs = remote[field];
    const changedBank =
      (banks.has(field) || field === "campaignSchedule") &&
      [original, mine, theirs].every(Array.isArray) &&
      !same(original, mine) &&
      !same(original, theirs) &&
      !same(mine, theirs);
    if (
      field === "quizCategories" &&
      [original, mine, theirs].every(Array.isArray)
    ) {
      const selected = new Set(theirs);
      for (const category of original)
        if (!mine.includes(category)) selected.delete(category);
      for (const category of mine)
        if (!original.includes(category)) selected.add(category);
      result[field] = [...selected];
      continue;
    }
    const merged = changedBank
      ? mergeBank(original, mine, theirs, field)
      : mergeValue(original, mine, theirs, labels[field]);
    if (merged !== undefined) result[field] = merged;
    else delete result[field];
  }
  return same(result, remote) ? remote : result;
}
