// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { parseDescriptionTags } from "../public/js/description-parser.js";

describe("parseDescriptionTags (frontend)", () => {
  it("should return empty string for empty description", () => {
    expect(parseDescriptionTags("", "")).toBe("");
  });

  it("should escape plain HTML text", () => {
    const result = parseDescriptionTags(
      "Hello <script>alert('xss')</script>",
      "",
    );
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("should convert LINE tags to <br>", () => {
    const result = parseDescriptionTags("Line1<LINE>Line2", "");
    expect(result).toBe("Line1<br>Line2");
  });

  it("should convert BR tags to double <br>", () => {
    const result = parseDescriptionTags("Line1<BR>Line2", "");
    expect(result).toBe("Line1<br><br>Line2");
  });

  it("should convert SPACE tags to space character", () => {
    const result = parseDescriptionTags("Hello<SPACE>World", "");
    expect(result).toBe("Hello World");
  });

  it("should convert H1 to centered large heading span", () => {
    const result = parseDescriptionTags("<H1>Title", "");
    expect(result).toBe('<span class="pz-h1">Title</span>');
  });

  it("should convert H2 to left-aligned medium heading span", () => {
    const result = parseDescriptionTags("<H2>Section", "");
    expect(result).toBe('<span class="pz-h2">Section</span>');
  });

  it("should handle TEXT tag to reset formatting", () => {
    const result = parseDescriptionTags("<H1>Title<TEXT>Normal", "");
    expect(result).toBe('<span class="pz-h1">Title</span>Normal');
  });

  it("should handle RED color tag", () => {
    const result = parseDescriptionTags("<RED>Red text", "");
    expect(result).toBe('<span style="color: rgb(255,0,0)">Red text</span>');
  });

  it("should handle ORANGE color tag", () => {
    const result = parseDescriptionTags("<ORANGE>Orange text", "");
    expect(result).toBe('<span style="color: rgb(255,165,0)">Orange text</span>');
  });

  it("should handle GREEN color tag", () => {
    const result = parseDescriptionTags("<GREEN>Green text", "");
    expect(result).toBe('<span style="color: rgb(0,255,0)">Green text</span>');
  });

  it("should handle GHC tag", () => {
    const result = parseDescriptionTags("<GHC>Good color", "");
    expect(result).toContain("var(--ghc");
  });

  it("should handle BHC tag", () => {
    const result = parseDescriptionTags("<BHC>Bad color", "");
    expect(result).toContain("var(--bhc");
  });

  it("should handle RGB tag", () => {
    const result = parseDescriptionTags("<RGB:100,200,50>Custom color", "");
    expect(result).toBe('<span style="color: rgb(100,200,50)">Custom color</span>');
  });

  it("should handle PUSHRGB and POPRGB color stack", () => {
    const result = parseDescriptionTags("<PUSHRGB:255,0,0>Red<POPRGB>Back to default", "");
    expect(result).toContain("rgb(255,0,0)");
    expect(result).toContain("Back to default");
  });

  it("should handle CENTRE alignment", () => {
    const result = parseDescriptionTags("<CENTRE>Centered", "");
    expect(result).toBe('<span class="pz-align-centre">Centered</span>');
  });

  it("should handle LEFT alignment", () => {
    const result = parseDescriptionTags("<LEFT>Left aligned", "");
    expect(result).toBe('<span class="pz-align-left">Left aligned</span>');
  });

  it("should handle RIGHT alignment", () => {
    const result = parseDescriptionTags("<RIGHT>Right aligned", "");
    expect(result).toBe('<span class="pz-align-right">Right aligned</span>');
  });

  it("should handle SIZE tags", () => {
    const result = parseDescriptionTags("<SIZE:small>Small<SIZE:large>Large<SIZE:medium>Medium", "");
    expect(result).toContain("pz-size-small");
    expect(result).toContain("pz-size-large");
    expect(result).toContain("pz-size-medium");
  });

  it("should handle INDENT tag", () => {
    const result = parseDescriptionTags("<INDENT:30>Indented text", "");
    expect(result).toContain("padding-left: 30px");
  });

  it("should strip SETX tag", () => {
    const result = parseDescriptionTags("<SETX:100>Text", "");
    expect(result).toBe("Text");
  });

  it("should generate proper URL for IMAGE tag", () => {
    const result = parseDescriptionTags("<IMAGE:media/poster.png,100,200>", "12345/mods/MyMod");
    expect(result).toContain("/api/workshop-poster?rel=");
    expect(result).toContain("12345%2Fmods%2FMyMod%2Fmedia%2Fposter.png");
    expect(result).toContain('width="100"');
    expect(result).toContain('height="200"');
  });

  it("should generate proper URL for IMAGECENTRE tag", () => {
    const result = parseDescriptionTags("<IMAGECENTRE:media/header.png>", "12345/mods/MyMod");
    expect(result).toContain("pz-image-centre");
    expect(result).toContain("12345%2Fmods%2FMyMod%2Fmedia%2Fheader.png");
  });

  it("should handle JOYPAD tag", () => {
    const result = parseDescriptionTags("<JOYPAD:A,32,32>", "");
    expect(result).toContain("pz-joypad");
    expect(result).toContain("Joypad: A");
  });

  it("should handle VIDEOCENTRE tag", () => {
    const result = parseDescriptionTags("<VIDEOCENTRE:intro.bik,640,360>", "");
    expect(result).toContain("[Video: intro.bik]");
  });

  it("should handle VIDEOCENTRE with backup image", () => {
    const result = parseDescriptionTags("<VIDEOCENTRE:intro.bik,640,360,poster.png>", "12345/mods/MyMod");
    expect(result).toContain("pz-image-centre");
    expect(result).toContain("12345%2Fmods%2FMyMod%2Fposter.png");
  });

  it("should escape unknown tags", () => {
    const result = parseDescriptionTags("<UNKNOWN_TAG>", "");
    expect(result).toBe("&lt;UNKNOWN_TAG&gt;");
  });

  it("should handle text with no tags correctly", () => {
    const result = parseDescriptionTags("Plain text without any tags at all", "");
    expect(result).toBe("Plain text without any tags at all");
  });

  it("should handle multiple lines with H1 and BR", () => {
    const result = parseDescriptionTags("<H1>My Mod<BR><TEXT>Welcome to my mod.<LINE>Enjoy!", "");
    expect(result).toContain("pz-h1");
    expect(result).toContain("<br>");
  });

  it("should merge consecutive text with same format into single span", () => {
    const result = parseDescriptionTags("<RED>Red word1<LINE>Red word2<LINE>Red word3", "");
    expect(result).toBe('<span style="color: rgb(255,0,0)">Red word1<br>Red word2<br>Red word3</span>');
  });

  it("should handle H1 with embedded LINE", () => {
    const result = parseDescriptionTags("<H1>Title Line 1<LINE>Title Line 2", "");
    expect(result).toBe('<span class="pz-h1">Title Line 1<br>Title Line 2</span>');
  });

  it("should handle INDENT with negative value (clamped to 0)", () => {
    const result = parseDescriptionTags("<INDENT:-10>Text", "");
    expect(result).toContain("padding-left: 0px");
  });
});
