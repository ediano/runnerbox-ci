"use client";

import { useCallback, useEffect, useState } from "react";
import RunnerForm from "./RunnerForm";
import RunnersTable from "./RunnersTable";
import CreationProgress from "./CreationProgress";
import { readNdjsonStream } from "@/lib/ndjson";
import { applyProgressEvent, emptyProgress } from "@/lib/creation-progress";

const POLL_INTERVAL_MS = 5000;

export default function Dashboard() {
  const [runners, setRunners] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [progress, setProgress] = useState(null);
  // `editing` é zerado assim que a recriação termina; o painel de progresso precisa
  // lembrar qual dos dois fluxos gerou os eventos que está mostrando.
  const [editingSnapshot, setEditingSnapshot] = useState(false);

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
    setProgress(emptyProgress());
    // A recriação passa pelo mesmo caminho da criação: build da imagem incluso.
    setEditingSnapshot(Boolean(editing));
    try {
      const url = editing ? `/api/runners/${editing.id}` : "/api/runners";
      const response = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          // Pede o progresso em streaming; sem este header a rota responde o JSON único.
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify(form),
      });

      // Validação e falhas antes de abrir o stream continuam vindo como JSON com status.
      if (!response.ok || !response.body) {
        const data = await response.json();
        setProgress(null);
        return { error: data.error, errors: data.errors };
      }

      let runner = null;
      let failure = null;
      await readNdjsonStream(response.body, (event) => {
        setProgress((prev) => applyProgressEvent(prev || emptyProgress(), event));
        if (event.type === "done") runner = event.runner;
        if (event.type === "error") failure = event;
      });

      if (failure) {
        // O progresso fica na tela de propósito: é ele que mostra em que passo quebrou.
        return { error: failure.error, errors: failure.errors };
      }

      // A criação pode ter dado certo mas com uma ressalva (ex.: token não guardado).
      setNotice(runner?.warning || null);
      setEditing(null);
      setProgress(null);
      await refresh();
      return {};
    } catch (err) {
      setProgress(null);
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
        busyPhase={progress?.phase}
        onSubmit={handleSubmit}
        onCancelEdit={() => setEditing(null)}
      />

      {progress && <CreationProgress progress={progress} editing={editingSnapshot} />}

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
