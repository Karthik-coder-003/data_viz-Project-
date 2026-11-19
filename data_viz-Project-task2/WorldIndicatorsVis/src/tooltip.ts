import * as d3 from "d3";

// Tooltip helper from the course template. Added showTooltipHtml for multi-line tooltips.
const toolTip = d3.select("#tooltip");

export function showTooltip(x: number, y: number, text: string) {
    toolTip
        .style("left", `${x+2}px`) // Adjusted to show next to the cursor
        .style("top", `${y-30}px`) // Adjusted to show above the cursor
        .style("display", "block")
        .text(text);
}

/** Same as showTooltip, but takes HTML (only pass escaped text) and keeps the tooltip inside the window. */
export function showTooltipHtml(x: number, y: number, html: string) {
    toolTip.html(html).style("display", "block");
    const node = toolTip.node() as HTMLElement;
    const w = node.offsetWidth, h = node.offsetHeight;
    const left = x + 14 + w > window.innerWidth ? x - w - 14 : x + 14;
    const top = Math.max(4, Math.min(y - h / 2, window.innerHeight - h - 4));
    toolTip.style("left", `${left}px`).style("top", `${top}px`);
}

export function hideTooltip() {
    toolTip.style("display", "none");
}
