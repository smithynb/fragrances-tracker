export const MAX_SPRAYS = 100;

/** Sentinel for "no context selected" — Radix Select items can't use "" as a value. */
export const NO_CONTEXT_VALUE = "__none__";

export const CONTEXT_OPTIONS = [
  "Office",
  "Date Night",
  "Casual",
  "Formal",
  "Gym",
  "Evening Out",
  "Travel",
  "Special Occasion",
] as const;
