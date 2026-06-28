// Shared rapid-class → color mapping (deep green→red spectrum, one color per
// integer class). Compound grades like "III-IV" or "III+" map to the
// HIGHEST class present so we err on the side of caution. Unknown grade
// (null/empty) → deep blue, matching the "no class" legend swatch.
//
// CANONICAL PALETTE — when changing, ALSO update the duplicated copies
// inlined into the Leaflet HTML inside `app/map.tsx` and `app/track.tsx`
// so all three surfaces (river card, map screen, trip tracker) render
// the same class color for any given river run.

const RAPID_CLASS_COLORS = [
  "#1F5B9F", // 0 — unknown grade → deep blue
  "#1E7A3C", // I   forest green
  "#5F8B30", // II  deep olive
  "#B0860D", // III dark amber
  "#C9651E", // IV  burnt orange
  "#A82E21", // V   brick red
  "#5A1818", // VI  very dark crimson
];

export function rapidClassNum(grade: string | null | undefined): number {
  if (!grade) return 0;
  const tokens = String(grade).toUpperCase().match(/VI|IV|V|III|II|I/g) || [];
  const map: Record<string, number> = { VI: 6, V: 5, IV: 4, III: 3, II: 2, I: 1 };
  let max = 0;
  for (const t of tokens) {
    const n = map[t] || 0;
    if (n > max) max = n;
  }
  return max;
}

export function rapidColor(grade: string | null | undefined): string {
  return RAPID_CLASS_COLORS[rapidClassNum(grade)] || "#1D6FB8";
}
