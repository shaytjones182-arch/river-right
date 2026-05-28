// Shared rapid-class → color mapping (green→red spectrum, one color per
// integer class). Compound grades like "III-IV" or "III+" map to the
// HIGHEST class present so we err on the side of caution. Unknown grade
// (null/empty) → blue, matching the "no class" legend swatch.

const RAPID_CLASS_COLORS = [
  "#1D6FB8", // 0 — unknown grade → blue
  "#2E8B57", // I   true green
  "#88B04B", // II  yellow-green
  "#D4B106", // III yellow
  "#E08020", // IV  orange
  "#C0392B", // V   red
  "#6B1D1D", // VI  deep red
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
