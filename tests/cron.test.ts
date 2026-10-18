import { describe, it, expect } from "vitest";
import {
  isValidCronExpression,
  matchesCronExpression,
  parseCronExpression,
} from "../src/scheduler/cron.js";

function matches(expression: string, date: Date): boolean {
  return matchesCronExpression(parseCronExpression(expression), date);
}

describe("cron", () => {
  describe("parseCronExpression", () => {
    it("parses wildcards and steps", () => {
      const schedule = parseCronExpression("*/15 0-6 1,15 * 1-5");

      expect([...schedule.minutes]).toEqual([0, 15, 30, 45]);
      expect([...schedule.hours]).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect([...schedule.daysOfMonth]).toEqual([1, 15]);
      expect(schedule.dayOfMonthRestricted).toBe(true);
      expect(schedule.dayOfWeekRestricted).toBe(true);
    });

    it("normalizes Sunday 7 to 0", () => {
      const schedule = parseCronExpression("0 4 * * 7");
      expect([...schedule.daysOfWeek]).toEqual([0]);
    });

    it("supports step values on ranges", () => {
      const schedule = parseCronExpression("10-20/5 * * * *");
      expect([...schedule.minutes]).toEqual([10, 15, 20]);
    });

    it("rejects malformed expressions", () => {
      expect(isValidCronExpression("* * * *")).toBe(false);
      expect(isValidCronExpression("* * * * * *")).toBe(false);
      expect(isValidCronExpression("60 * * * *")).toBe(false);
      expect(isValidCronExpression("* 24 * * *")).toBe(false);
      expect(isValidCronExpression("*/0 * * * *")).toBe(false);
      expect(isValidCronExpression("20-10 * * * *")).toBe(false);
      expect(isValidCronExpression("a * * * *")).toBe(false);
      expect(isValidCronExpression("")).toBe(false);
    });
  });

  describe("matchesCronExpression", () => {
    it("matches on the wall-clock minute", () => {
      const date = new Date(2026, 9, 18, 10, 30, 45);
      expect(matches("*/15 * * * *", date)).toBe(true);
      expect(matches("*/15 * * * *", new Date(2026, 9, 18, 10, 31))).toBe(false);
    });

    it("matches a daily fixed time", () => {
      expect(matches("0 4 * * *", new Date(2026, 9, 18, 4, 0))).toBe(true);
      expect(matches("0 4 * * *", new Date(2026, 9, 18, 4, 1))).toBe(false);
      expect(matches("0 4 * * *", new Date(2026, 9, 18, 5, 0))).toBe(false);
    });

    it("matches the configured day of week", () => {
      const monday = new Date(2026, 9, 19, 4, 0);
      const tuesday = new Date(2026, 9, 20, 4, 0);

      expect(matches("0 4 * * 1", monday)).toBe(true);
      expect(matches("0 4 * * 1", tuesday)).toBe(false);
      expect(matches("0 4 * * 7", new Date(2026, 9, 18, 4, 0))).toBe(true);
    });

    it("uses OR semantics when both day fields are restricted", () => {
      const expression = "0 4 19 * 1";

      expect(matches(expression, new Date(2026, 9, 19, 4, 0))).toBe(true);
      expect(matches(expression, new Date(2026, 9, 26, 4, 0))).toBe(true);
      expect(matches(expression, new Date(2026, 9, 20, 4, 0))).toBe(false);
    });

    it("uses AND semantics when only one day field is restricted", () => {
      const expression = "0 4 19 * *";

      expect(matches(expression, new Date(2026, 9, 19, 4, 0))).toBe(true);
      expect(matches(expression, new Date(2026, 9, 19, 5, 0))).toBe(false);
      expect(matches(expression, new Date(2026, 9, 20, 4, 0))).toBe(false);
    });
  });
});
