import { isIP } from "node:net";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;

export type StartupOptions = {
  configPath?: string;
  host: string;
  port: number;
};

function parsePort(rawPort: string): number {
  if (!/^\d+$/.test(rawPort)) {
    throw new Error("Invalid --port: must be an integer.");
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid --port: must be between 1 and 65535.");
  }

  return port;
}

function parseHost(rawHost: string): string {
  const host = rawHost.trim();
  if (!host) {
    throw new Error("Invalid --host: address must not be empty.");
  }

  if (/\s/.test(host) || host.includes("/")) {
    throw new Error(`Invalid --host: ${rawHost}`);
  }

  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }

  return host;
}

export function parseStartupOptions(argv: string[]): StartupOptions {
  let configPath: string | undefined;
  let host = DEFAULT_HOST;
  let port = DEFAULT_PORT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--config") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --config.");
      }

      configPath = value;
      i += 1;
      continue;
    }

    if (arg === "--host") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --host.");
      }

      host = parseHost(value);
      i += 1;
      continue;
    }

    if (arg === "--port") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --port.");
      }

      port = parsePort(value);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { configPath, host, port };
}

export function formatListenUrl(host: string, port: number): string {
  const urlHost = isIP(host) === 6 ? `[${host}]` : host;
  return `http://${urlHost}:${port}`;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.startsWith("127.") ||
    normalized === "::ffff:127.0.0.1"
  );
}
