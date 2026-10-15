"use client";

import { useState } from "react";
import useUsage from "./useUsage";
import { formatBytes, formatCpu } from "@/lib/format";

const KIND_LABELS = { panel: "Panel", runner: "Runner", job: "Job", other: "Other" };

const KIND_CLASSES = {
  panel: "bg-violet-950 text-violet-300 ring-violet-800",
  runner: "bg-sky-950 text-sky-300 ring-sky-800",
  job: "bg-amber-950 text-amber-300 ring-amber-800",
  other: "bg-slate-800 text-slate-300 ring-slate-700",
};

// A ordem aqui é a ordem dos cabeçalhos e precisa bater com a das células de cada linha.
const SORTS = {
  cpu: { label: "CPU", key: "cpuPercent" },
  memory: { label: "Memory", key: "memoryBytes" },
  disk: { label: "Disk", key: "diskBytes" },
};

export default function ResourceUsage() {
  const { usage, error, measuringDisk, measureDisk: onMeasureDisk } = useUsage({ withDisk: true });
  const [sort, setSort] = useState("memory");

  if (!usage) {
    return (
      <section className="space-y-3">
        <Heading measuringDisk={measuringDisk} onMeasureDisk={onMeasureDisk} />
        <p className="rounded-xl border border-dashed border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
          {error || "Measuring…"}
        </p>
      </section>
    );
  }

  const { host, containers, summary } = usage;
  const sortKey = SORTS[sort].key;
  // O painel fica sempre no topo, como referência; o resto segue a ordenação escolhida.
  const rows = [...containers].sort(
    (a, b) => (b.kind === "panel") - (a.kind === "panel") || (b[sortKey] ?? -1) - (a[sortKey] ?? -1)
  );
  const runnerGroups = Object.entries(summary.byRunner).sort((a, b) => b[1].memoryBytes - a[1].memoryBytes);

  return (
    <section className="space-y-3">
      <Heading measuringDisk={measuringDisk} onMeasureDisk={onMeasureDisk} />

      {error && <p className="rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-300">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <TopCard label="Highest CPU" top={summary.top.cpu} format={formatCpu} />
        <TopCard label="Highest memory" top={summary.top.memory} format={formatBytes} />
        <TopCard
          label="Highest disk"
          top={summary.top.disk}
          format={formatBytes}
          empty={measuringDisk ? "Measuring…" : "Not measured yet"}
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm sm:grid-cols-3">
        <Stat
          label="CPU (all containers)"
          value={`${formatCpu(summary.total.cpuPercent)} of ${host.cpus * 100}%`}
          hint={`${host.cpus} CPUs; 100% = one full core`}
        />
        <Stat
          label="Memory (all containers)"
          value={`${formatBytes(summary.total.memoryBytes)} of ${formatBytes(host.memoryBytes)}`}
          hint="Page cache the kernel can reclaim is not counted"
        />
        <Stat
          label="Docker disk"
          value={host.disk ? formatBytes(host.disk.total) : "—"}
          hint={
            host.disk
              ? `Images ${formatBytes(host.disk.images)} · containers ${formatBytes(host.disk.containers)} · volumes ${formatBytes(host.disk.volumes)} · build cache ${formatBytes(host.disk.buildCache)}`
              : "Images, containers, volumes and build cache"
          }
        />
      </div>

      {runnerGroups.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-medium">By runner (runner + its job containers)</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {runnerGroups.map(([name, totals]) => (
              <li key={name} className="flex flex-wrap justify-between gap-2">
                <span>
                  {name}
                  {totals.count > 1 && (
                    <span className="ml-2 text-xs text-slate-400">{totals.count} containers</span>
                  )}
                </span>
                <span className="text-slate-300">
                  {formatCpu(totals.cpuPercent)} · {formatBytes(totals.memoryBytes)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Container</th>
              <th className="px-4 py-3 font-medium">Type</th>
              {Object.entries(SORTS).map(([id, column]) => (
                <th key={id} className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => setSort(id)}
                    aria-pressed={sort === id}
                    className={`uppercase tracking-wide ${sort === id ? "text-slate-100" : "hover:text-slate-200"}`}
                  >
                    {column.label}
                    {sort === id && " ↓"}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-800/60 last:border-0">
                <td className="px-4 py-3">
                  <span className="block font-medium">{row.name}</span>
                  {row.kind === "job" && (
                    <span className="block text-xs text-slate-400">job of {row.runner || "an unknown runner"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${KIND_CLASSES[row.kind]}`}>
                    {KIND_LABELS[row.kind]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Meter value={row.cpuPercent} max={host.cpus * 100} />
                  <span className="text-xs text-slate-300">{formatCpu(row.cpuPercent)}</span>
                </td>
                <td className="px-4 py-3">
                  <Meter value={row.memoryBytes} max={row.memoryLimitBytes || host.memoryBytes} />
                  <span className="text-xs text-slate-300">
                    {formatBytes(row.memoryBytes)}
                    <span className="text-slate-500">
                      {" / "}
                      {hasMemoryLimit(row, host) ? formatBytes(row.memoryLimitBytes) : "no limit"}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-300">
                  {row.diskBytes === null ? "—" : formatBytes(row.diskBytes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Disk is each container&apos;s writable layer (for GitHub runners it includes the job workspace). Images, volumes
        and build cache are counted in &quot;Docker disk&quot;.
      </p>
    </section>
  );
}

// Sem limite, o Docker informa a memória da máquina inteira como teto.
function hasMemoryLimit(row, host) {
  return row.memoryLimitBytes > 0 && row.memoryLimitBytes < host.memoryBytes * 0.99;
}

function Heading({ measuringDisk, onMeasureDisk }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">Resource usage</h2>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">CPU and memory every 10s · disk every minute</span>
        <button
          type="button"
          onClick={onMeasureDisk}
          disabled={measuringDisk}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-800 disabled:opacity-60"
        >
          {measuringDisk ? "Measuring disk…" : "Measure disk now"}
        </button>
      </div>
    </div>
  );
}

function TopCard({ label, top, format, empty = "—" }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <span className="block text-xs uppercase tracking-wide text-slate-400">{label}</span>
      {top ? (
        <>
          <span className="mt-1 block text-lg font-semibold">{format(top.value)}</span>
          <span className="block truncate text-sm text-slate-300" title={top.name}>
            {top.name} <span className="text-xs text-slate-500">({KIND_LABELS[top.kind]})</span>
          </span>
        </>
      ) : (
        <span className="mt-1 block text-sm text-slate-400">{empty}</span>
      )}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div>
      <span className="block text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className="mt-1 block font-medium">{value}</span>
      <span className="block text-xs text-slate-500">{hint}</span>
    </div>
  );
}

function Meter({ value, max }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mb-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full bg-slate-300" style={{ width: `${percent}%` }} />
    </div>
  );
}
