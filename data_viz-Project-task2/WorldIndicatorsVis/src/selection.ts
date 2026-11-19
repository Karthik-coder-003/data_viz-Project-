import { Selection } from "./types";

/*
 * Central selection state.
 * Every visualization calls onSelectionChange(...) once and redraws itself when the selection changes.
 * This is what links the Task 1 chart, the Task 2 map and the Task 3 clustering together.
 */

export const MAX_FEATURES = 5;  // Task 1: "scale up to 5 features"
export const MAX_COMPARE = 9;   // 1 focus country + 9 others = 10 spatial areas

let selection: Selection = { focus: "", compare: [], features: [] };
const listeners: ((s: Selection) => void)[] = [];

export function getSelection(): Selection {
  return selection;
}

export function onSelectionChange(listener: (s: Selection) => void): void {
  listeners.push(listener);
}

function update(next: Selection): void {
  selection = next;
  for (const listener of listeners) listener(selection);
}

export function setInitialSelection(s: Selection): void {
  update({ ...s, compare: s.compare.filter((c) => c !== s.focus).slice(0, MAX_COMPARE), features: s.features.slice(0, MAX_FEATURES) });
}

/** Makes a country the focus country. The previous focus country is moved into the comparison set. */
export function setFocus(iso3: string): void {
  if (iso3 === selection.focus) return;
  let compare = selection.compare.filter((c) => c !== iso3);
  if (selection.focus) compare = [selection.focus, ...compare].slice(0, MAX_COMPARE);
  update({ ...selection, focus: iso3, compare });
}

/** Adds or removes a comparison country. Returns false if the limit is reached. */
export function toggleCompare(iso3: string): boolean {
  if (iso3 === selection.focus) return true;
  if (selection.compare.includes(iso3)) {
    update({ ...selection, compare: selection.compare.filter((c) => c !== iso3) });
    return true;
  }
  if (selection.compare.length >= MAX_COMPARE) return false;
  update({ ...selection, compare: [...selection.compare, iso3] });
  return true;
}

/** Adds or removes a feature. Returns false if the limit is reached. */
export function toggleFeature(key: string): boolean {
  if (selection.features.includes(key)) {
    update({ ...selection, features: selection.features.filter((f) => f !== key) });
    return true;
  }
  if (selection.features.length >= MAX_FEATURES) return false;
  update({ ...selection, features: [...selection.features, key] });
  return true;
}
