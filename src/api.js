// Start the authenticated bootstrap while React's component modules initialize.
// Only the HttpOnly cookie authenticates requests; no private state is cached in localStorage.
export async function apiRequest(type, payload) {
  const response = await fetch(
    type ? "/api/app" : "/api/app?bootstrap=1",
    type
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
