import * as d3 from "d3";

/** Readable number formatting: 1.23T / 456k for very large numbers, whole numbers above 1000, 2 decimals otherwise. */
export function formatValue(v: number | null): string {
  if (v === null) return "–";
  if (Math.abs(v) >= 1e9) return d3.format(".3~s")(v).replace("G", "B");
  if (Math.abs(v) >= 1000) return d3.format(",.0f")(v);
  return d3.format(",.2f")(v);
}

/** Escapes text before it is put into HTML (country names come from a data file). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
