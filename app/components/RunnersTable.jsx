"use client";

const PLATFORM_LABELS = { github: "GitHub Actions", gitlab: "GitLab CI" };

function stateClass(state) {
  if (state === "running") return "bg-emerald-100 text-emerald-800";
  if (state === "created" || state === "restarting") return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-700";
}

export default function RunnersTable({ runners, onEdit, onDelete, busyId }) {
  if (runners.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Nenhum runner gerenciado no momento.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Runner</th>
            <th className="px-4 py-3 font-medium">Plataforma</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {runners.map((runner) => (
            <tr key={runner.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3">
                <span className="block font-medium">{runner.name}</span>
                <span className="block text-xs text-slate-500">{runner.url}</span>
              </td>
              <td className="px-4 py-3">{PLATFORM_LABELS[runner.platform] || runner.platform}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${stateClass(runner.state)}`}
                  title={runner.status}
                >
                  {runner.state}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(runner)}
                    disabled={busyId === runner.id}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(runner)}
                    disabled={busyId === runner.id}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {busyId === runner.id ? "Removendo…" : "Excluir"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
