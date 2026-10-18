import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Availability of a Workshop item as reported by Steam.
 *
 * `available`   - public item, downloadable
 * `unlisted`    - hidden from browse/search but still downloadable by id
 * `restricted`  - friends-only or private, servers usually cannot download it
 * `banned`      - banned on the Workshop, cannot be downloaded
 * `unavailable` - Steam no longer returns the item (deleted or hidden)
 * `unknown`     - the request failed, status cannot be determined
 */
export type WorkshopAvailabilityStatus =
  | "available"
  | "unlisted"
  | "restricted"
  | "banned"
  | "unavailable"
  | "unknown";

export type WorkshopAvailabilityEntry = {
  id: string;
  status: WorkshopAvailabilityStatus;
  downloaded: boolean;
  title: string;
  fileSize: number;
  visibility: number | null;
  banned: boolean;
  bannedReason: string;
  error: string;
};

export type WorkshopAvailabilityOptions = {
  workshopPath?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  attempts?: number;
};

type SteamFileDetails = {
  publishedfileid?: string;
  result?: number;
  title?: string;
  file_size?: number;
  visibility?: number;
  banned?: number;
  banned_reason?: string;
};

const STEAM_DETAILS_ENDPOINT =
  "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const REQUEST_CHUNK_SIZE = 50;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_ATTEMPTS = 2;

export function isValidWorkshopId(value: string): boolean {
  return /^\d{1,20}$/.test(value);
}

async function requestDetailsChunk(
  ids: string[],
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<SteamFileDetails[]> {
  const body = new URLSearchParams();
  body.set("itemcount", String(ids.length));
  ids.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));

  const response = await fetchImpl(STEAM_DETAILS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Steam API returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    response?: { publishedfiledetails?: SteamFileDetails[] };
  };

  return payload.response?.publishedfiledetails ?? [];
}

async function requestDetailsChunkWithRetry(
  ids: string[],
  fetchImpl: typeof fetch,
  timeoutMs: number,
  attempts: number,
): Promise<SteamFileDetails[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestDetailsChunk(ids, fetchImpl, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function toEntry(
  id: string,
  detail: SteamFileDetails | undefined,
  requestFailed: boolean,
  workshopPath: string,
): WorkshopAvailabilityEntry {
  const downloaded = workshopPath ? existsSync(join(workshopPath, id)) : false;
  const base: WorkshopAvailabilityEntry = {
    id,
    status: "unknown",
    downloaded,
    title: "",
    fileSize: 0,
    visibility: null,
    banned: false,
    bannedReason: "",
    error: "",
  };

  if (requestFailed) {
    return { ...base, error: "Steam API request failed" };
  }

  if (!detail) {
    return { ...base, error: "No details returned by Steam" };
  }

  const result = detail.result ?? 0;
  const title = detail.title ?? "";
  const fileSize = detail.file_size ?? 0;

  if (result !== 1) {
    return { ...base, status: "unavailable", title, fileSize, error: `Steam result ${result}` };
  }

  const visibility = typeof detail.visibility === "number" ? detail.visibility : 0;
  const banned = detail.banned === 1;
  const bannedReason = detail.banned_reason ?? "";

  let status: WorkshopAvailabilityStatus = "available";
  if (banned) {
    status = "banned";
  } else if (visibility === 3) {
    status = "unlisted";
  } else if (visibility === 1 || visibility === 2) {
    status = "restricted";
  }

  return {
    ...base,
    status,
    title,
    fileSize,
    visibility,
    banned,
    bannedReason,
  };
}

/**
 * Queries Steam for the given Workshop item ids and reports whether each one
 * can still be downloaded. Requests are batched and retried; a failed batch
 * only marks its own items as `unknown` instead of aborting the whole check.
 */
export async function checkWorkshopAvailability(
  ids: string[],
  options: WorkshopAvailabilityOptions = {},
): Promise<WorkshopAvailabilityEntry[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const workshopPath = options.workshopPath ?? "";

  const uniqueIds = [...new Set(ids.filter(isValidWorkshopId))];
  const details = new Map<string, SteamFileDetails>();
  const failedIds = new Set<string>();

  for (let start = 0; start < uniqueIds.length; start += REQUEST_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(start, start + REQUEST_CHUNK_SIZE);

    try {
      const results = await requestDetailsChunkWithRetry(chunk, fetchImpl, timeoutMs, attempts);
      for (const detail of results) {
        if (detail.publishedfileid) {
          details.set(detail.publishedfileid, detail);
        }
      }
    } catch {
      for (const id of chunk) {
        failedIds.add(id);
      }
    }
  }

  return uniqueIds.map((id) => toEntry(id, details.get(id), failedIds.has(id), workshopPath));
}
