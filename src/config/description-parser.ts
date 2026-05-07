import { join, relative, resolve } from "node:path";
import { existsSync } from "node:fs";

const TAG_RE = /<([^>]+)>/g;

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toUrlPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function resolveModFilePath(folderPath: string, imageValue: string): string {
  const trimmed = imageValue.trim();
  if (!trimmed) return "";
  return join(folderPath, ...trimmed.split(/[\\/]+/).filter((s) => s.length > 0));
}

function resolveImageUrl(workshopRootPath: string, folderPath: string, imagePath: string): string {
  const filePath = resolveModFilePath(folderPath, imagePath);
  if (!filePath) return "";
  const absolutePath = resolve(filePath);
  const rootAbs = resolve(workshopRootPath);
  const relToRoot = toUrlPath(relative(rootAbs, absolutePath));
  const isUnderRoot = !!relToRoot && relToRoot !== ".." && !relToRoot.startsWith("../");
  const exists = absolutePath && isUnderRoot && existsSync(absolutePath);
  return exists ? "/api/workshop-poster?rel=" + encodeURIComponent(relToRoot) : "";
}

interface FormatState {
  h1: boolean;
  h2: boolean;
  size: string;
  color: string | null;
  colorStack: string[];
  align: string;
  indent: string;
}

function defaultState(): FormatState {
  return {
    h1: false,
    h2: false,
    size: "",
    color: null,
    colorStack: [],
    align: "",
    indent: "",
  };
}

function cloneState(s: FormatState): FormatState {
  return { ...s, colorStack: [...s.colorStack] };
}

function stateChanged(a: FormatState, b: FormatState): boolean {
  return (
    a.h1 !== b.h1 ||
    a.h2 !== b.h2 ||
    a.size !== b.size ||
    a.color !== b.color ||
    a.align !== b.align ||
    a.indent !== b.indent
  );
}

function buildSpanAttrs(s: FormatState): string {
  const classes: string[] = [];
  const styles: string[] = [];

  if (s.h1) classes.push("pz-h1");
  if (s.h2) classes.push("pz-h2");
  if (!s.h1 && !s.h2) {
    if (s.size) classes.push("pz-size-" + s.size);
    if (s.color) styles.push("color: rgb(" + s.color + ")");
    if (s.align) classes.push("pz-align-" + s.align);
  }
  if (s.indent) styles.push("padding-left: " + s.indent + "px");

  const parts: string[] = [];
  if (classes.length > 0) parts.push('class="' + classes.join(" ") + '"');
  if (styles.length > 0) parts.push('style="' + styles.join("; ") + '"');
  return parts.join(" ");
}

function handleFormatTag(tagBody: string, state: FormatState): Partial<FormatState> | null {
  switch (tagBody) {
    case "H1":
      return { h1: true, h2: false, size: "large", align: "centre", color: null, indent: "" };
    case "H2":
      return { h2: true, h1: false, size: "medium", align: "left", color: null, indent: "" };
    case "TEXT":
      return { h1: false, h2: false, size: "", color: null, align: "" };
    case "CENTRE":
      return { align: "centre" };
    case "LEFT":
      return { align: "left" };
    case "RIGHT":
      return { align: "right" };
    case "RED":
      return { color: "255,0,0" };
    case "ORANGE":
      return { color: "255,165,0" };
    case "GREEN":
      return { color: "0,255,0" };
    case "GHC":
      return { color: "var(--ghc, 0,255,0)" };
    case "BHC":
      return { color: "var(--bhc, 255,0,0)" };
    case "POPRGB": {
      const stack = [...state.colorStack];
      const prevColor = stack.pop();
      return { color: prevColor ?? null, colorStack: stack };
    }
    default:
      return null;
  }
}

function handleValueTag(tagBody: string, state: FormatState): Partial<FormatState> | null {
  const tagLC = tagBody.toLowerCase();

  if (tagLC.startsWith("rgb:")) {
    const rgb = tagBody.slice(4);
    return { color: rgb };
  }

  if (tagLC.startsWith("pushrgb:")) {
    const rgb = tagBody.slice(8);
    return {
      color: rgb,
      colorStack: [...state.colorStack, state.color ?? "255,255,255"],
    };
  }

  if (tagLC.startsWith("size:")) {
    return { size: tagBody.slice(5).toLowerCase() };
  }

  if (tagLC.startsWith("indent:")) {
    const n = parseInt(tagBody.slice(7), 10);
    return { indent: isNaN(n) ? "" : String(Math.max(n, 0)) };
  }

  return null;
}

function emitFormatTag(tagBody: string, state: FormatState): boolean {
  const formatChanges = handleFormatTag(tagBody, state);
  const valueChanges = handleValueTag(tagBody, state);

  if (formatChanges) {
    Object.assign(state, formatChanges);
  }
  if (valueChanges) {
    Object.assign(state, valueChanges);
  }

  return !!(formatChanges || valueChanges);
}

function emitStructuralTag(
  tagBody: string,
  folderPath: string,
  workshopRootPath: string,
): string {
  switch (tagBody) {
    case "LINE":
      return "<br>";
    case "BR":
      return "<br><br>";
    case "SPACE":
      return " ";
  }

  // SETX:int
  const sxMatch = tagBody.match(/^SETX:(-?\d+)$/i);
  if (sxMatch) {
    return "";
  }

  // IMAGE:path,width,height
  const imgMatch = tagBody.match(/^IMAGE:(.+)$/i);
  if (imgMatch) {
    const parts = imgMatch[1].split(",");
    const imgPath = parts[0]?.trim() ?? "";
    const w = parts[1]?.trim();
    const h = parts[2]?.trim();
    const url = resolveImageUrl(workshopRootPath, folderPath, imgPath);
    if (url) {
      let attrs = 'src="' + url + '" alt=""';
      if (w) attrs += ' width="' + w + '"';
      if (h) attrs += ' height="' + h + '"';
      return '<img class="pz-image" ' + attrs + '>';
    }
    return escapeText("[" + tagBody + "]");
  }

  // IMAGECENTRE:path,width,height
  const imgcMatch = tagBody.match(/^IMAGECENTRE:(.+)$/i);
  if (imgcMatch) {
    const parts = imgcMatch[1].split(",");
    const imgPath = parts[0]?.trim() ?? "";
    const w = parts[1]?.trim();
    const h = parts[2]?.trim();
    const url = resolveImageUrl(workshopRootPath, folderPath, imgPath);
    if (url) {
      let attrs = 'src="' + url + '" alt=""';
      if (w) attrs += ' width="' + w + '"';
      if (h) attrs += ' height="' + h + '"';
      return '<div class="pz-image-centre"><img ' + attrs + '></div>';
    }
    return escapeText("[" + tagBody + "]");
  }

  // JOYPAD:key,width,height
  const jpMatch = tagBody.match(/^JOYPAD:(.+)$/i);
  if (jpMatch) {
    const parts = jpMatch[1].split(",");
    const key = parts[0]?.trim() ?? "?";
    return '<span class="pz-joypad">[' + escapeText("Joypad: " + key) + "]</span>";
  }

  // VIDEOCENTRE:video.bik,ow,oh,backupimg
  // or VIDEOCENTRE:video.bik,ow,oh,dw,dh
  const vcMatch = tagBody.match(/^VIDEOCENTRE:(.+)$/i);
  if (vcMatch) {
    const parts = vcMatch[1].split(",").map((s) => s.trim());
    const videoName = parts[0] ?? "";
    const backup = parts[3] && !parts[4] ? parts[3] : null;
    if (backup) {
      const url = resolveImageUrl(workshopRootPath, folderPath, backup);
      if (url) {
        return '<div class="pz-image-centre"><img src="' + url + '" alt="' + escapeText(videoName) + '"></div>';
      }
    }
    return escapeText("[Video: " + videoName + "]");
  }

  return escapeText("<" + tagBody + ">");
}

export function parseDescriptionTags(
  description: string,
  folderPath: string,
  workshopRootPath: string,
): string {
  if (!description) return "";

  let result = "";
  const state = defaultState();
  let prevState = defaultState();
  let spanOpen = false;
  let lastIndex = 0;

  TAG_RE.lastIndex = 0;
  let match = TAG_RE.exec(description);

  while (match !== null) {
    if (match.index > lastIndex) {
      const text = description.slice(lastIndex, match.index);
      if (!spanOpen) {
        const attrs = buildSpanAttrs(state);
        if (attrs) {
          result += "<span " + attrs + ">";
          spanOpen = true;
        }
      } else if (stateChanged(prevState, state)) {
        result += "</span>";
        spanOpen = false;
        const attrs = buildSpanAttrs(state);
        if (attrs) {
          result += "<span " + attrs + ">";
          spanOpen = true;
        }
      }
      result += escapeText(text);
      prevState = cloneState(state);
    }

    const tagBody = match[1];

    const isFormatTag = emitFormatTag(tagBody, state);

    if (isFormatTag) {
      lastIndex = match.index + match[0].length;
      match = TAG_RE.exec(description);
      continue;
    }

    if (spanOpen && stateChanged(prevState, state)) {
      result += "</span>";
      spanOpen = false;
    }

    result += emitStructuralTag(tagBody, folderPath, workshopRootPath);

    prevState = cloneState(state);
    lastIndex = match.index + match[0].length;
    match = TAG_RE.exec(description);
  }

  if (lastIndex < description.length) {
    const text = description.slice(lastIndex);
    if (!spanOpen) {
      const attrs = buildSpanAttrs(state);
      if (attrs) {
        result += "<span " + attrs + ">";
        spanOpen = true;
      }
    } else if (stateChanged(prevState, state)) {
      result += "</span>";
      spanOpen = false;
      const attrs = buildSpanAttrs(state);
      if (attrs) {
        result += "<span " + attrs + ">";
        spanOpen = true;
      }
    }
    result += escapeText(text);
  }

  if (spanOpen) {
    result += "</span>";
  }

  return result;
}
