// @vitest-environment happy-dom

import { describe, it, expect, afterEach, vi } from "vitest";
import { formatUptime, startUptimeTimer } from "../../public/js/server-manager.js";

describe("server-manager.js", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("formats uptime as hours, minutes, and seconds", () => {
    expect(formatUptime(0, 65_000)).toBe("00:01:05");
    expect(formatUptime(0, 3_600_000 + 2_000)).toBe("01:00:02");
  });

  it("prefixes the uptime with days when it exceeds one day", () => {
    const elapsed = ((24 + 2) * 3600 + 3 * 60 + 4) * 1000;
    expect(formatUptime(0, elapsed)).toBe("1天 02:03:04");
  });

  it("returns a placeholder for invalid start times and clamps future times", () => {
    expect(formatUptime("not-a-date", Date.now())).toBe("--");
    expect(formatUptime(10_000, 0)).toBe("00:00:00");
  });

  it("refreshes the uptime value every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    document.body.innerHTML = '<span id="serverUptime"></span>';
    const uptimeEl = document.getElementById("serverUptime");
    uptimeEl.dataset.startedAt = String(Date.now() - 5_000);

    startUptimeTimer();
    vi.advanceTimersByTime(1_000);

    expect(uptimeEl.textContent).toBe("00:00:06");
  });
});
