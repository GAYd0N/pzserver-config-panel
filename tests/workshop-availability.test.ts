import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  checkWorkshopAvailability,
  isValidWorkshopId,
} from "../src/config/workshop-availability.js";

const testDir = "test-fixtures/workshop-availability";

type FetchCall = { url: string; init: RequestInit };

function createFetchMock(details: Array<Record<string, unknown>>) {
  const calls: FetchCall[] = [];

  return {
    calls,
    fetch: async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: { publishedfiledetails: details } }),
      };
    },
  };
}

function fetchDetails(id: string, overrides: Record<string, unknown> = {}) {
  return { publishedfileid: id, result: 1, title: `Mod ${id}`, file_size: 100, visibility: 0, banned: 0, ...overrides };
}

describe("workshop availability", () => {
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("validates workshop ids", () => {
    expect(isValidWorkshopId("2335368829")).toBe(true);
    expect(isValidWorkshopId("12345678901234567890")).toBe(true);
    expect(isValidWorkshopId("")).toBe(false);
    expect(isValidWorkshopId("../2353")).toBe(false);
    expect(isValidWorkshopId("abc")).toBe(false);
  });

  it("classifies public, unlisted, restricted, banned and missing items", async () => {
    const mock = createFetchMock([
      fetchDetails("1"),
      fetchDetails("2", { visibility: 3 }),
      fetchDetails("3", { visibility: 2 }),
      fetchDetails("4", { banned: 1, banned_reason: "Terms of Service" }),
      { publishedfileid: "5", result: 9 },
    ]);

    const entries = await checkWorkshopAvailability(["1", "2", "3", "4", "5"], {
      fetchImpl: mock.fetch as unknown as typeof fetch,
    });

    expect(entries.map((entry) => entry.status)).toEqual([
      "available",
      "unlisted",
      "restricted",
      "banned",
      "unavailable",
    ]);
    expect(entries[0].title).toBe("Mod 1");
    expect(entries[0].fileSize).toBe(100);
    expect(entries[3].banned).toBe(true);
    expect(entries[3].bannedReason).toBe("Terms of Service");
    expect(entries[4].error).toBe("Steam result 9");
  });

  it("marks items as downloaded when the workshop folder contains them", async () => {
    await mkdir(join(testDir, "42"), { recursive: true });
    const mock = createFetchMock([
      fetchDetails("42", { visibility: 0 }),
      { publishedfileid: "43", result: 9 },
    ]);

    const entries = await checkWorkshopAvailability(["42", "43"], {
      workshopPath: testDir,
      fetchImpl: mock.fetch as unknown as typeof fetch,
    });

    expect(entries[0].downloaded).toBe(true);
    expect(entries[1].downloaded).toBe(false);
  });

  it("sends the expected form body and batches requests", async () => {
    const ids = Array.from({ length: 51 }, (_, index) => String(1000 + index));
    const mock = createFetchMock(ids.map((id) => fetchDetails(id)));

    const entries = await checkWorkshopAvailability(ids, {
      fetchImpl: mock.fetch as unknown as typeof fetch,
    });

    expect(entries).toHaveLength(51);
    expect(mock.calls).toHaveLength(2);
    const firstBody = mock.calls[0].init.body as URLSearchParams;
    expect(firstBody.get("itemcount")).toBe("50");
    expect(firstBody.get("publishedfileids[0]")).toBe("1000");
    const secondBody = mock.calls[1].init.body as URLSearchParams;
    expect(secondBody.get("itemcount")).toBe("1");
    expect(secondBody.get("publishedfileids[0]")).toBe("1050");
  });

  it("deduplicates and filters invalid ids", async () => {
    const mock = createFetchMock([fetchDetails("7")]);

    const entries = await checkWorkshopAvailability(["7", "7", "abc", ""], {
      fetchImpl: mock.fetch as unknown as typeof fetch,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("7");
  });

  it("marks a chunk as unknown when Steam cannot be reached", async () => {
    const fetchImpl = async () => {
      throw new Error("network down");
    };

    const entries = await checkWorkshopAvailability(["9"], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      attempts: 1,
    });

    expect(entries[0].status).toBe("unknown");
    expect(entries[0].error).toBe("Steam API request failed");
  });

  it("retries a failed request", async () => {
    let attempts = 0;
    const fetchImpl = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          response: { publishedfiledetails: [fetchDetails("11")] },
        }),
      };
    };

    const entries = await checkWorkshopAvailability(["11"], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(attempts).toBe(2);
    expect(entries[0].status).toBe("available");
  });

  it("treats a non-OK HTTP response as a failed chunk", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });

    const entries = await checkWorkshopAvailability(["12"], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      attempts: 1,
    });

    expect(entries[0].status).toBe("unknown");
  });

  it("returns an empty list without calling Steam when no ids are given", async () => {
    const mock = createFetchMock([]);

    const entries = await checkWorkshopAvailability([], {
      fetchImpl: mock.fetch as unknown as typeof fetch,
    });

    expect(entries).toEqual([]);
    expect(mock.calls).toHaveLength(0);
  });
});
