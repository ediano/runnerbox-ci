import { describe, expect, it } from "vitest";
import {
  MAX_LOG_LINES,
  applyProgressEvent,
  busyLabel,
  emptyProgress,
  pullTotals,
  stepStatus,
} from "./creation-progress.js";

function reduce(events) {
  return events.reduce(applyProgressEvent, emptyProgress());
}

describe("applyProgressEvent", () => {
  it("tracks phases and the latest message", () => {
    const state = reduce([
      { type: "phase", phase: "image", message: "Building image…" },
      { type: "phase", phase: "container", message: "Creating container…" },
    ]);
    expect(state.phase).toBe("container");
    expect(state.message).toBe("Creating container…");
  });

  it("accumulates pull progress per layer", () => {
    const state = reduce([
      { type: "pull", layer: "a", status: "Downloading", current: 10, total: 100 },
      { type: "pull", layer: "b", status: "Downloading", current: 20, total: 100 },
      { type: "pull", layer: "a", status: "Downloading", current: 50, total: 100 },
    ]);
    expect(state.phase).toBe("pull");
    expect(pullTotals(state.layers)).toEqual({ current: 70, total: 200, percent: 35 });
  });

  it("caps the log buffer", () => {
    const events = Array.from({ length: MAX_LOG_LINES + 20 }, (_, i) => ({
      type: "log",
      message: `line ${i}`,
    }));
    const state = reduce(events);
    expect(state.logs).toHaveLength(MAX_LOG_LINES);
    expect(state.logs.at(-1)).toBe(`line ${MAX_LOG_LINES + 19}`);
  });

  it("keeps the log when an error arrives, so the failing step stays visible", () => {
    const state = reduce([
      { type: "log", message: "Step 3/9" },
      { type: "error", error: "build failed" },
    ]);
    expect(state.error).toBe("build failed");
    expect(state.logs).toEqual(["Step 3/9"]);
  });
});

describe("pullTotals", () => {
  it("reports indeterminate progress when no layer knows its size", () => {
    expect(pullTotals({ a: { status: "Extracting" } }).percent).toBeNull();
    expect(pullTotals({}).percent).toBeNull();
  });
});

describe("stepStatus", () => {
  it("marks earlier steps done and later ones pending", () => {
    expect(stepStatus("image", "container")).toBe("done");
    expect(stepStatus("container", "container")).toBe("active");
    expect(stepStatus("start", "container")).toBe("pending");
  });

  it("marks everything done once the runner is up", () => {
    expect(stepStatus("start", "done")).toBe("done");
  });
});

describe("busyLabel", () => {
  it("falls back to the generic label without a phase", () => {
    expect(busyLabel(undefined)).toBe("Working…");
    expect(busyLabel("pull")).toBe("Downloading…");
  });
});
