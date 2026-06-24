import { describe, it, expect } from "vitest";
import { isCatchupDue, catchupWeekOf } from "../../src/platform/catchup";
import { bookingWeekOf } from "../../src/platform/cron";

// 2026-06-26 is a Friday (anchor the weekday so the rest is meaningful).
const friday2100 = new Date(2026, 5, 26, 21, 0, 0);
const friday2000 = new Date(2026, 5, 26, 20, 0, 0);
const saturday = new Date(2026, 5, 27, 9, 0, 0);
const sunday = new Date(2026, 5, 28, 9, 0, 0);
const monday = new Date(2026, 5, 29, 9, 0, 0);
const thursday = new Date(2026, 5, 25, 9, 0, 0);

describe("booking catch-up timing", () => {
  it("anchors: 2026-06-26 is a Friday", () => {
    expect(friday2100.getDay()).toBe(5);
  });

  it("is due on Fri after 21:00, Sat, and Sun", () => {
    expect(isCatchupDue(friday2100)).toBe(true);
    expect(isCatchupDue(saturday)).toBe(true);
    expect(isCatchupDue(sunday)).toBe(true);
  });

  it("is NOT due before Fri 21:00, or from Monday on", () => {
    expect(isCatchupDue(friday2000)).toBe(false);
    expect(isCatchupDue(monday)).toBe(false);
    expect(isCatchupDue(thursday)).toBe(false);
  });

  it("computes the same weekOf as the Friday cron (Friday + 1)", () => {
    expect(catchupWeekOf(saturday)).toBe("2026-06-27"); // Fri 26 + 1
    expect(catchupWeekOf(friday2100)).toBe("2026-06-27");
    expect(bookingWeekOf(friday2100)).toBe("2026-06-27");
  });
});
