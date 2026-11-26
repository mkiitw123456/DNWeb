import { randomBytes } from "node:crypto";

function reject(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

export function manageLicenses(state, token, type, payload) {
  const user = state.users.find(u => u.id === token?.id && u.active && u.version === token.version);
  if (!user) reject("請重新登入", 401);
  if (!user.admin) reject("只有管理員可管理授權碼", 403);
  const licenses = state.overlayLicenses ??= [];
  if (type !== "license.list") {
    if (typeof payload.note !== "string" || payload.note.length > 200) reject("備註限 200 字");
    const note = payload.note.trim();
    if (type === "license.create") {
      const code = randomBytes(16).toString("hex").toUpperCase().match(/.{4}/g).join("-");
      licenses.unshift({ code, note, activatedAt: null });
    } else if (type === "license.note") {
      const license = licenses.find(item => item.code === payload.code);
      if (!license) reject("找不到授權碼", 404);
      license.note = note;
    } else reject("未知的授權操作");
  }
  return { licenses: licenses.map(({ code, note, activatedAt }) => ({ code, note, activatedAt })) };
}

export function activateLicense(state, { code, device }) {
  if (typeof code !== "string" || code.length > 64 || !/^[A-F0-9]{64}$/.test(device) || typeof device !== "string") reject("授權資料格式錯誤");
  const license = state.overlayLicenses?.find(item => item.code === code.trim().toUpperCase());
  if (!license) reject("授權碼無效", 404);
  if (license.device && license.device !== device) reject("這組授權碼已綁定其他設備", 409);
  license.device = device;
  license.activatedAt ??= new Date().toISOString();
  return { activated: true, device };
}
