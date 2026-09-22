"use client";

import { useEffect, useRef } from "react";
import { STEPS, formatBytes, pullTotals, stepStatus } from "@/lib/creation-progress";

function Marker({ status, failed }) {
  if (failed) return <span className="text-red-400">✕</span>;
  if (status === "done") return <span className="text-emerald-400">●</span>;
  if (status === "active") return <span className="animate-pulse text-amber-300">▸</span>;
  return <span className="text-slate-600">○</span>;
}

export default function CreationProgress({ progress, editing }) {
  const logRef = useRef(null);
  const { phase, message, logs, layers, error } = progress;
  const { current, total, percent } = pullTotals(layers);

  // O log só é útil se acompanhar a saída; sem isto o usuário fica olhando o topo.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // "Removing the current container" só existe no fluxo de recriação.
  const steps = STEPS.filter((step) => step.id !== "removing" || editing);

  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-100">
          {editing ? "Recreating runner" : "Creating runner"}
        </h3>
        {message && <p className="truncate text-xs text-slate-400">{message}</p>}
      </header>

      <ul className="space-y-1 text-sm">
        {steps.map((step) => {
          const status = stepStatus(step.id, phase);
          const failed = Boolean(error) && status === "active";
          return (
            <li key={step.id} className="flex items-center gap-2">
              <Marker status={status} failed={failed} />
              <span
                className={
                  status === "pending"
                    ? "text-slate-500"
                    : status === "active"
                      ? "text-slate-100"
                      : "text-slate-400"
                }
              >
                {step.label}
              </span>
              {step.id === "pull" && status !== "pending" && percent !== null && (
                <span className="text-xs text-slate-400">{percent}%</span>
              )}
            </li>
          );
        })}
      </ul>

      {total > 0 && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {formatBytes(current)} / {formatBytes(total)}
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-300">{error}</p>
      )}

      {logs.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
            Show build log
          </summary>
          <pre
            ref={logRef}
            className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-400"
          >
            {logs.join("\n")}
          </pre>
        </details>
      )}

      <p className="text-xs text-slate-500">
        The first run builds the runner image, which can take a few minutes. This is normal.
      </p>
    </section>
  );
}
