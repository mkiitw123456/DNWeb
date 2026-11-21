const key = "ddstar.encounter-motion";
export function encounterMotion() {
  try { return localStorage.getItem(key) === "full" ? "full" : "system"; }
  catch { return "system"; }
}
export function setEncounterMotion(value) {
  localStorage.setItem(key, value);
}
