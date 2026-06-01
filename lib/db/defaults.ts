// ============================================================
// AERIE — minimal structural defaults seeded on first boot.
// (Not mock data — just the visibility groups the Admin UI needs.
// Services and users come from the YAML config + the Admin UI.)
// ============================================================
export const DEFAULT_GROUPS: [string, string][] = [
  ["admins", "Admins"],
  ["friends", "Friends"],
  ["guests", "Guests"],
];
