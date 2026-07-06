/**
 * Builds a Convex patch from update-mutation args that use the
 * "null clears, undefined leaves unchanged" convention:
 *   undefined → key omitted (no change)
 *   null      → key present with value undefined (clears the field)
 *   value     → key set to that value
 */
export function buildPatch<T extends Record<string, unknown>>(
  args: T,
): { [K in keyof T]?: Exclude<T[K], null> | undefined } {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue;
    patch[key] = value === null ? undefined : value;
  }
  return patch as { [K in keyof T]?: Exclude<T[K], null> | undefined };
}
