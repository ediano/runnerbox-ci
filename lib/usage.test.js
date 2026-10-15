import { describe, expect, it } from "vitest";
import {
  buildUsageEntry,
  classifyContainer,
  cpuPercent,
  memoryUsage,
  mergeUsage,
  processCpuPercent,
  summarizeDiskUsage,
  summarizeUsage,
} from "./usage.js";

const MB = 1024 * 1024;

// Recorte do `GET /containers/{id}/stats?stream=false` num host com cgroup v2.
const statsV2 = {
  cpu_stats: {
    cpu_usage: { total_usage: 2_000_000_000 },
    system_cpu_usage: 110_000_000_000,
    online_cpus: 4,
  },
  precpu_stats: {
    cpu_usage: { total_usage: 1_500_000_000 },
    system_cpu_usage: 100_000_000_000,
  },
  memory_stats: { usage: 300 * MB, limit: 2048 * MB, stats: { inactive_file: 100 * MB } },
};

// cgroup v1: sem online_cpus em hosts antigos e com total_inactive_file.
const statsV1 = {
  cpu_stats: {
    cpu_usage: { total_usage: 400, percpu_usage: [1, 2] },
    system_cpu_usage: 2000,
  },
  precpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 1000 },
  memory_stats: { usage: 500 * MB, limit: 1024 * MB, stats: { total_inactive_file: 50 * MB } },
};

describe("cpuPercent", () => {
  it("follows the docker stats formula on cgroup v2", () => {
    // 0.5e9 / 10e9 * 4 CPUs * 100 = 20%
    expect(cpuPercent(statsV2)).toBeCloseTo(20);
  });

  it("falls back to percpu_usage length on cgroup v1", () => {
    // 200 / 1000 * 2 * 100 = 40%
    expect(cpuPercent(statsV1)).toBeCloseTo(40);
  });

  it("is zero without a previous sample", () => {
    expect(cpuPercent({ cpu_stats: statsV2.cpu_stats, precpu_stats: {} })).toBe(0);
    expect(cpuPercent(undefined)).toBe(0);
  });
});

describe("memoryUsage", () => {
  it("discounts reclaimable page cache like the docker CLI", () => {
    expect(memoryUsage(statsV2)).toEqual({ used: 200 * MB, limit: 2048 * MB, percent: (200 / 2048) * 100 });
    expect(memoryUsage(statsV1).used).toBe(450 * MB);
  });

  it("handles stats of a container that just stopped", () => {
    expect(memoryUsage({ memory_stats: {} })).toEqual({ used: 0, limit: 0, percent: 0 });
  });
});

describe("classifyContainer", () => {
  it("recognizes the panel by its image label", () => {
    const info = { Id: "p", Names: ["/runnerbox-ci"], Labels: { "ci.runnerbox.role": "panel" } };
    expect(classifyContainer(info)).toEqual({ kind: "panel", name: "runnerbox-ci", runner: null });
  });

  it("recognizes the panel by its own container id", () => {
    expect(classifyContainer({ Id: "abcdef123456789", Names: ["/x"], Labels: {} }, "abcdef123456").kind).toBe("panel");
  });

  it("recognizes runners and their names", () => {
    const info = {
      Id: "r",
      Names: ["/runnerbox-worker-build"],
      Labels: { "ci.runnerbox.managed": "true", "ci.runnerbox.name": "build" },
    };
    expect(classifyContainer(info)).toEqual({ kind: "runner", name: "runnerbox-worker-build", runner: "build" });
  });

  it("attributes GitLab job containers to their runner", () => {
    const info = {
      Id: "j",
      Names: ["/runner-abc-project-1-concurrent-0-build"],
      Labels: { "com.gitlab.gitlab-runner.managed": "true", "ci.runnerbox.runner": "gitlab-1" },
    };
    expect(classifyContainer(info)).toMatchObject({ kind: "job", runner: "gitlab-1" });
  });

  it("keeps GitLab jobs from older registrations as jobs of an unknown runner", () => {
    const info = { Id: "j", Names: ["/job"], Labels: { "com.gitlab.gitlab-runner.managed": "true" } };
    expect(classifyContainer(info)).toMatchObject({ kind: "job", runner: null });
  });

  it("leaves anything else as other", () => {
    expect(classifyContainer({ Id: "1234567890abcdef", Labels: {} })).toEqual({
      kind: "other",
      name: "1234567890ab",
      runner: null,
    });
  });
});

describe("buildUsageEntry", () => {
  it("combines the container and its stats", () => {
    const info = { Id: "r", Names: ["/w"], State: "running", SizeRw: 42, Labels: { "ci.runnerbox.managed": "true" } };
    expect(buildUsageEntry(info, statsV2)).toMatchObject({
      id: "r",
      kind: "runner",
      state: "running",
      memoryBytes: 200 * MB,
      memoryLimitBytes: 2048 * MB,
      diskBytes: 42,
    });
  });

  it("marks disk as unknown when it was not measured", () => {
    expect(buildUsageEntry({ Id: "r", Labels: {} }, statsV2).diskBytes).toBeNull();
  });
});

describe("processCpuPercent", () => {
  it("measures the panel process between two samples", () => {
    // 500 ms de CPU em 1 s de relógio = meio núcleo.
    expect(processCpuPercent({ user: 0, system: 0, at: 0 }, { user: 300_000, system: 200_000, at: 1000 })).toBe(50);
  });

  it("is zero on the first sample", () => {
    expect(processCpuPercent(null, { user: 1, system: 1, at: 1 })).toBe(0);
  });
});

const entries = [
  { id: "p", kind: "panel", name: "runnerbox-ci", runner: null, cpuPercent: 1, memoryBytes: 120 * MB, diskBytes: 10 },
  { id: "r", kind: "runner", name: "w-build", runner: "build", cpuPercent: 5, memoryBytes: 300 * MB, diskBytes: 900 },
  { id: "j", kind: "job", name: "job", runner: "build", cpuPercent: 150, memoryBytes: 1500 * MB, diskBytes: 50 },
  { id: "o", kind: "other", name: "postgres", runner: null, cpuPercent: 2, memoryBytes: 200 * MB, diskBytes: null },
];

describe("summarizeUsage", () => {
  const summary = summarizeUsage(entries);

  it("finds the heaviest container for each resource", () => {
    expect(summary.top.cpu).toEqual({ id: "j", name: "job", kind: "job", value: 150 });
    expect(summary.top.memory.id).toBe("j");
    expect(summary.top.disk).toEqual({ id: "r", name: "w-build", kind: "runner", value: 900 });
  });

  it("adds each runner to its job containers", () => {
    expect(summary.byRunner.build).toEqual({ count: 2, cpuPercent: 155, memoryBytes: 1800 * MB, diskBytes: 950 });
  });

  it("totals by kind and overall", () => {
    expect(summary.byKind.panel.memoryBytes).toBe(120 * MB);
    expect(summary.byKind.other.count).toBe(1);
    expect(summary.total.count).toBe(4);
  });

  it("has no top disk when disk was not measured", () => {
    expect(summarizeUsage([{ ...entries[0], diskBytes: null }]).top.disk).toBeNull();
  });
});

describe("summarizeDiskUsage", () => {
  it("sums images, containers, volumes and build cache", () => {
    const df = {
      LayersSize: 1000,
      Containers: [{ SizeRw: 10 }, { SizeRw: 5 }],
      // -1 = tamanho ainda não calculado pelo daemon.
      Volumes: [{ UsageData: { Size: 100 } }, { UsageData: { Size: -1 } }],
      BuildCache: [{ Size: 30 }, { Size: 70, Shared: true }],
    };
    expect(summarizeDiskUsage(df)).toEqual({
      images: 1000,
      containers: 15,
      volumes: 100,
      buildCache: 30,
      total: 1145,
    });
  });
});

describe("mergeUsage", () => {
  const full = { host: { disk: { total: 1 } }, containers: entries, summary: summarizeUsage(entries) };
  const quick = {
    host: { disk: null },
    containers: entries.map((entry) => ({ ...entry, diskBytes: null })),
    summary: {},
  };

  it("carries the last disk measurement into quick samples", () => {
    const merged = mergeUsage(full, quick);
    expect(merged.host.disk).toEqual({ total: 1 });
    expect(merged.containers.find((entry) => entry.id === "r").diskBytes).toBe(900);
    expect(merged.summary.top.disk.id).toBe("r");
  });

  it("takes a new full measurement as is", () => {
    expect(mergeUsage(quick, full)).toBe(full);
  });
});
