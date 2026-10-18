import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  formatListenUrl,
  isLoopbackHost,
  parseStartupOptions,
} from "../src/cli-options.js";

describe("cli-options", () => {
  it("uses loopback and port 3000 by default", () => {
    expect(parseStartupOptions([])).toEqual({
      configPath: undefined,
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
    });
  });

  it("parses host, port, and legacy config options", () => {
    expect(
      parseStartupOptions([
        "--host",
        "0.0.0.0",
        "--port",
        "8080",
        "--config",
        "/tmp/legacy.ini",
      ]),
    ).toEqual({
      configPath: "/tmp/legacy.ini",
      host: "0.0.0.0",
      port: 8080,
    });
  });

  it("accepts bracketed IPv6 addresses", () => {
    expect(parseStartupOptions(["--host", "[::1]"])).toMatchObject({ host: "::1" });
  });

  it("rejects missing and invalid hosts", () => {
    expect(() => parseStartupOptions(["--host"])).toThrow("Missing value for --host");
    expect(() => parseStartupOptions(["--host", "bad host"])).toThrow("Invalid --host");
    expect(() => parseStartupOptions(["--host", "bad/host"])).toThrow("Invalid --host");
  });

  it("rejects invalid ports", () => {
    expect(() => parseStartupOptions(["--port", "abc"])).toThrow("must be an integer");
    expect(() => parseStartupOptions(["--port", "0"])).toThrow("between 1 and 65535");
    expect(() => parseStartupOptions(["--port", "65536"])).toThrow("between 1 and 65535");
  });

  it("rejects unknown arguments", () => {
    expect(() => parseStartupOptions(["--unknown"])).toThrow("Unknown argument");
  });

  it("formats IPv4, hostname, and IPv6 listen URLs", () => {
    expect(formatListenUrl("127.0.0.1", 3000)).toBe("http://127.0.0.1:3000");
    expect(formatListenUrl("localhost", 8080)).toBe("http://localhost:8080");
    expect(formatListenUrl("::1", 3000)).toBe("http://[::1]:3000");
  });

  it("recognizes loopback addresses", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.10.0.2")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.10")).toBe(false);
  });
});
