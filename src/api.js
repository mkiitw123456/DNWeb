// Start the authenticated bootstrap while React's component modules initialize.
// Only the HttpOnly cookie authenticates requests; no private state is cached in localStorage.
// Reads (including background polling) and controls with their own sync indicator
// do not open the shared status badge.
const quietActions = new Set([
  "state", "login", "logout", "register", "activity.summary", "activity.quizScores",
  "activity.report", "competition.history", "competition.room", "firebase.usage",
  "discord.members", "character.quickSave", "character.gear",
]);
export function apiRequest(type, payload) {
  return trackWrite(type, () => performRequest(type, payload));
}
export async function trackWrite(type, work) {
  if (!type || type.endsWith(".state") || quietActions.has(type)) return work();
  const id = crypto.randomUUID();
  const announce = (state, message = "") =>
    window.dispatchEvent(
      new CustomEvent("ddstar-save", { detail: { id, state, message } }),
    );
  announce("pending");
  try {
    const result = await work();
    announce("success");
    return result;
  } catch (error) {
    announce("error", error.message);
    throw error;
  }
}
export async function performRequest(type, payload) {
  const response = await fetch(
    type ? "/api/app" : "/api/app?bootstrap=1",
    type
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(
            ["character.gear", "character.quickSave"].includes(type)
              ? 20000
              : 35000,
          ),
          body: JSON.stringify({ type, payload }),
        }
      : { credentials: "same-origin", signal: AbortSignal.timeout(15000) },
  );
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error || "連線失敗，請稍後重試"), {
      status: response.status,
    });
  return result;
}
export const initialSession = apiRequest();
// Avoid an unhandled rejection if the response arrives before React mounts.
initialSession.catch(() => {});
