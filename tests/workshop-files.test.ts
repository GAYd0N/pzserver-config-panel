import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeWorkshopItemDirectory } from "../src/config/workshop-files.js";

let workshopRoot: string;

describe("removeWorkshopItemDirectory", () => {
  beforeEach(async () => {
    workshopRoot = await mkdtemp(join(tmpdir(), "pz-workshop-files-"));
  });

  afterEach(async () => {
    await rm(workshopRoot, { recursive: true, force: true });
  });

  it("removes the workshop item directory recursively", async () => {
    const itemPath = join(workshopRoot, "123456789");
    const siblingPath = join(workshopRoot, "987654321");
    await mkdir(join(itemPath, "mods", "TestMod"), { recursive: true });
    await writeFile(join(itemPath, "mods", "TestMod", "mod.info"), "name=Test\nid=TestMod\n");
    await mkdir(siblingPath, { recursive: true });

    const result = await removeWorkshopItemDirectory(workshopRoot, "123456789");

    expect(result.removed).toBe(true);
    expect(existsSync(itemPath)).toBe(false);
    expect(existsSync(siblingPath)).toBe(true);
    expect(existsSync(workshopRoot)).toBe(true);
  });

  it("returns removed=false when the item directory does not exist", async () => {
    const result = await removeWorkshopItemDirectory(workshopRoot, "999999999");

    expect(result.removed).toBe(false);
    expect(result.path).toBe(join(workshopRoot, "999999999"));
  });

  it("rejects path traversal and invalid item ids", async () => {
    await expect(removeWorkshopItemDirectory(workshopRoot, "../outside")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(removeWorkshopItemDirectory(workshopRoot, ".")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(removeWorkshopItemDirectory(workshopRoot, "123/evil")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects a workshop item path that is not a directory", async () => {
    const itemPath = join(workshopRoot, "123456789");
    await writeFile(itemPath, "not a directory");

    await expect(removeWorkshopItemDirectory(workshopRoot, "123456789")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(existsSync(itemPath)).toBe(true);
  });
});
