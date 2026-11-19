import test from "node:test";
import assert from "node:assert/strict";
import { mergeActivityConflict } from "../shared/activity-config-patch.js";

test("admin conflict recovery merges calendar days, separate fields in a question and additions from both drafts", () => {
  const question = { id: "q", question: "舊題目", explanation: "舊解析" };
  const base = {
    version: 4,
    schedule: {},
    questions: [question],
    quizCategories: ["海龍"],
  };
  const local = {
    ...base,
    schedule: { "2026-12-01": { quiz: "q" }, "2026-12-02": { fortune: "f" } },
    questions: [{ ...question, question: "新題目" }, { id: "local" }],
    quizCategories: ["海龍", "沙龍"],
  };
  const remote = {
    ...base,
    version: 5,
    schedule: { "2026-12-01": { event: "e" }, "2026-12-03": { quiz: "q" } },
    questions: [{ ...question, explanation: "新解析" }, { id: "remote" }],
    quizCategories: ["海龍", "綠龍"],
  };
  const result = mergeActivityConflict(base, local, remote);
  assert.equal(result.version, 5);
  assert.deepEqual(result.schedule, {
    "2026-12-01": { quiz: "q", event: "e" },
    "2026-12-02": { fortune: "f" },
    "2026-12-03": { quiz: "q" },
  });
  assert.deepEqual(result.questions, [
    { id: "q", question: "新題目", explanation: "新解析" },
    { id: "remote" },
    { id: "local" },
  ]);
  assert.deepEqual(result.quizCategories, ["海龍", "綠龍", "沙龍"]);
  assert.equal(mergeActivityConflict(base, base, remote), remote);
});

test("conflicting edits and edit versus deletion preserve both sources and report the affected row", () => {
  const a = { id: "a", title: "原本的籤文" },
    b = { id: "b", title: "籤文二" };
  const base = { fortunes: [a, b] };
  const local = { fortunes: [{ ...a, title: "自己的草稿" }, b] };
  for (const remote of [
    { fortunes: [{ ...a, title: "其他管理員的新版" }, b] },
    { fortunes: [b] },
  ]) {
    assert.throws(
      () => mergeActivityConflict(base, local, remote),
      /籤文.*自己的草稿.*無法自動合併/,
    );
    assert.equal(local.fortunes[0].title, "自己的草稿");
  }
  assert.deepEqual(
    mergeActivityConflict(
      base,
      { fortunes: [b] },
      { fortunes: [a, b, { id: "c" }] },
    ),
    { fortunes: [b, { id: "c" }] },
  );
});
