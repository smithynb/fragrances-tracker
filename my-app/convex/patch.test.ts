import { describe, expect, test } from "vitest";
import { buildPatch } from "./patch";

describe("buildPatch", () => {
  test("omits undefined args entirely", () => {
    const patch = buildPatch({ name: undefined, sprays: 4 });
    expect("name" in patch).toBe(false);
    expect(patch.sprays).toBe(4);
  });

  test("maps null to a present key with value undefined (field clear)", () => {
    const patch = buildPatch({ comment: null });
    expect("comment" in patch).toBe(true);
    expect(patch.comment).toBeUndefined();
  });

  test("passes real values through, including falsy ones", () => {
    const patch = buildPatch({ name: "Aventus", comment: "", rating: 0 });
    expect(patch).toEqual({ name: "Aventus", comment: "", rating: 0 });
  });
});
