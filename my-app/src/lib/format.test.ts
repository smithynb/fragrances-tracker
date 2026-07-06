import { describe, expect, test } from "vitest";
import { formatWearDate, formatWearTime } from "./format";

const CURRENT_YEAR = new Date().getFullYear();

describe("formatWearDate", () => {
  test("omits the year for dates in the current year", () => {
    const ts = new Date(CURRENT_YEAR, 5, 14, 12, 0).getTime(); // Jun 14
    expect(formatWearDate(ts)).toBe("Jun 14");
  });

  test("includes the year for dates in other years", () => {
    const ts = new Date(CURRENT_YEAR - 1, 0, 5, 12, 0).getTime(); // Jan 5 last year
    expect(formatWearDate(ts)).toBe(`Jan 5, ${CURRENT_YEAR - 1}`);
  });

  test("prepends a short weekday when requested", () => {
    const ts = new Date(CURRENT_YEAR - 1, 0, 5, 12, 0).getTime();
    const result = formatWearDate(ts, { weekday: true });
    expect(result).toMatch(/^\w{3}, Jan 5, \d{4}$/);
  });
});

describe("formatWearTime", () => {
  test("formats hour:minute with AM/PM", () => {
    const ts = new Date(CURRENT_YEAR, 5, 14, 14, 30).getTime();
    expect(formatWearTime(ts)).toBe("2:30 PM");
  });
});
