import { describe, expect, it } from "vitest";
import { formatBytes, formatCpu, formatResources } from "./format.js";

describe("formatBytes", () => {
  it("uses MB below a gigabyte and GB above", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(512 * 1024 * 1024)).toBe("512.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});

describe("formatCpu", () => {
  it("keeps one decimal for small values", () => {
    expect(formatCpu(0.456)).toBe("0.5%");
    expect(formatCpu(250.4)).toBe("250%");
    expect(formatCpu(undefined)).toBe("0.0%");
  });
});

describe("formatResources", () => {
  it("summarizes limits and network", () => {
    expect(formatResources({ cpus: 2, memoryMb: 4096, network: "host" })).toBe("2 CPU · 4 GB · host");
    expect(formatResources({ cpus: 1.5, memoryMb: 768, network: "bridge" })).toBe("1.5 CPU · 768 MB · bridge");
  });

  it("says when there is no limit", () => {
    expect(formatResources({ cpus: null, memoryMb: null, network: "host" })).toBe("no CPU limit · no memory limit · host");
  });
});
