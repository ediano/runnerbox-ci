"use client";

import { useCallback, useEffect, useState } from "react";
import RunnerForm from "./RunnerForm";
import RunnersTable from "./RunnersTable";

const POLL_INTERVAL_MS = 5000;

export default function Dashboard() {
  const [runners, setRunners] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/runners", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to list runners.");
      setRunners(data.runners);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  // Polling é o que dá o "tempo real" da spec §3B sem depender de eventos do daemon.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function handleSubmit(form) {
    setBusy(true);
    try {
      const url = editing ? `/api/runners/${editing.id}` : "/api/runners";
      const response = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) return { error: data.error, errors: data.errors };
      // A criação pode ter dado certo mas com uma ressalva (ex.: token não guardado).
      setNotice(data.runner?.warning || null);
      setEditing(null);
      await refresh();
      return {};
    } catch (err) {
      return { error: err.message };
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(runner) {
    if (!window.confirm(`Delete runner "${runner.name}"? Its container will be removed.`)) return;
    setBusyId(runner.id);
    try {
      const response = await fetch(`/api/runners/${runner.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) setLoadError(data.error || "Failed to delete the runner.");
      if (editing?.id === runner.id) setEditing(null);
      await refresh();
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <RunnerForm
        editing={editing}
        busy={busy}
        onSubmit={handleSubmit}
        onCancelEdit={() => setEditing(null)}
      />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Managed runners</h2>
          <span className="text-xs text-slate-400">Refreshed every 5s</span>
        </div>

        {loadError && (
          <p className="rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-300">{loadError}</p>
        )}

        {notice && (
          <p className="rounded-lg border border-amber-900 bg-amber-950 p-3 text-sm text-amber-300">
            {notice}
          </p>
        )}

        <RunnersTable
          runners={runners}
          busyId={busyId}
          onEdit={setEditing}
          onDelete={handleDelete}
        />
      </section>
    </div>
  );
}
