"use client";

import { availableActions } from "@/lib/runner-spec";

const PLATFORM_LABELS = { github: "GitHub Actions", gitlab: "GitLab CI" };

function stateClass(state) {
  if (state === "running") return "bg-emerald-950 text-emerald-300 ring-1 ring-emerald-800";
  if (state === "created" || state === "restarting") return "bg-amber-950 text-amber-300 ring-1 ring-amber-800";
  return "bg-slate-800 text-slate-300 ring-1 ring-slate-700";
}

// "exited" é o termo do Docker; para quem parou o runner pelo painel, é só "stopped".
function stateLabel(state) {
  return state === "exited" ? "stopped" : state;
}

const LIFECYCLE_BUTTONS = {
  start: { label: "Start", busyLabel: "Starting…", title: "Start the runner, keeping its registration" },
  stop: { label: "Stop", busyLabel: "Stopping…", title: "Stop the runner until it is started again" },
  restart: { label: "Restart", busyLabel: "Restarting…", title: "Restart the runner container" },
};

export default function RunnersTable({
  runners,
  onLifecycle,
  onEdit,
  onUpdate,
  onDelete,
  busyRow,
  disabled,
}) {
  if (runners.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
        No managed runners yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Runner</th>
            <th className="px-4 py-3 font-medium">Platform</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {runners.map((runner) => {
            const rowAction = busyRow?.id === runner.id ? busyRow.action : null;
            return (
              <tr key={runner.id} className="border-b border-slate-800/60 last:border-0">
                <td className="px-4 py-3">
                  <span className="block font-medium">
                    {runner.name}
                    {runner.updateAvailable && (
                      <span
                        className="ml-2 rounded-full bg-sky-950 px-2 py-0.5 text-xs font-medium text-sky-300 ring-1 ring-sky-800"
                        title="The panel ships a newer runner image than this container uses."
                      >
                        Update available
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-slate-400">{runner.url}</span>
                </td>
                <td className="px-4 py-3">{PLATFORM_LABELS[runner.platform] || runner.platform}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${stateClass(runner.state)}`}
                    title={runner.status}
                  >
                    {stateLabel(runner.state)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {availableActions(runner.state).map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => onLifecycle(runner, action)}
                        disabled={disabled || Boolean(rowAction)}
                        title={LIFECYCLE_BUTTONS[action].title}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        {rowAction === action ? LIFECYCLE_BUTTONS[action].busyLabel : LIFECYCLE_BUTTONS[action].label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => onUpdate(runner)}
                      disabled={disabled || Boolean(rowAction)}
                      title="Move to the latest image, keeping the registration"
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {rowAction === "update" ? "Updating…" : "Update"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(runner)}
                      disabled={Boolean(rowAction)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(runner)}
                      disabled={Boolean(rowAction)}
                      className="rounded-lg border border-red-900 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-950 disabled:opacity-60"
                    >
                      {rowAction === "delete" ? "Removing…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
