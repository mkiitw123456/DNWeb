import { createHash, randomUUID } from "node:crypto";
import { fail } from "./domain.js";

export function roomCreateId(type, userId, submissionId) {
  if (submissionId === undefined) return randomUUID();
  if (
    typeof submissionId !== "string" ||
    !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(
      submissionId,
    )
  )
    fail("建立表單已失效，請重新開啟");
  return createHash("sha256")
    .update(JSON.stringify([type, userId, submissionId.toLowerCase()]))
    .digest("hex");
}

export function changedRoomDraft() {
  fail("先前送出的房間已建立。若要建立另一間，請關閉表單後重新建立。", 409);
}
