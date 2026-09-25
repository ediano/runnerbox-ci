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
  // Linha com ação em andamento e qual ação é, para o botão certo mostrar o rótulo.
  const [busyRow, setBusyRow] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [progress, setProgress] = useState(null);
  // `editing` é zerado assim que a recriação termina; o painel de progresso precisa
  // lembrar qual fluxo (create, edit ou update) gerou os eventos que está mostrando.
  const [progressMode, setProgressMode] = useState("create");

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

  // Criação, recriação e atualização respondem no mesmo formato NDJSON; este é o
  // único lugar que o lê. Devolve o runner final ou o erro, nunca lança.
  async function streamRunnerRequest(url, init) {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        // Pede o progresso em streaming; sem este header a rota responde o JSON único.
        Accept: "application/x-ndjson",
      },
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

    // O progresso fica na tela de propósito: é ele que mostra em que passo quebrou.
    if (failure) return { error: failure.error, errors: failure.errors, streamed: true };
    return { runner };
  }

  async function handleSubmit(form) {
    setBusy(true);
    setProgress(emptyProgress());
    // A recriação passa pelo mesmo caminho da criação: build da imagem incluso.
    setProgressMode(editing ? "edit" : "create");
    try {
      const url = editing ? `/api/runners/${editing.id}` : "/api/runners";
      const result = await streamRunnerRequest(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (result.error) return result;

      // A criação pode ter dado certo mas com uma ressalva (ex.: token não guardado).
      setNotice(result.runner?.warning || null);
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

  async function handleUpdate(runner) {
    if (
      !window.confirm(
        `Update runner "${runner.name}" to the latest image? Its registration is kept, but a job in progress will be interrupted.`
      )
    ) {
      return;
    }
    setBusy(true);
    setBusyRow({ id: runner.id, action: "update" });
    setNotice(null);
    setProgress(emptyProgress());
    setProgressMode("update");
    try {
      const result = await streamRunnerRequest(`/api/runners/${runner.id}/update`, { method: "POST" });
      if (!result.error) {
        setNotice(result.runner?.notice || null);
        setProgress(null);
      } else if (!result.streamed) {
        // Erro antes do stream (ex.: runner sumiu): não há painel de progresso para mostrá-lo.
        setLoadError(result.error);
      }
      if (editing?.id === runner.id) setEditing(null);
      await refresh();
    } catch (err) {
      setProgress(null);
      setLoadError(err.message);
    } finally {
      setBusy(false);
      setBusyRow(null);
    }
  }

  async function handleLifecycle(runner, action) {
    if (
      action !== "start" &&
      !window.confirm(
        `${action === "stop" ? "Stop" : "Restart"} runner "${runner.name}"? A job in progress will be interrupted.`
      )
    ) {
      return;
    }
    setBusyRow({ id: runner.id, action });
    setNotice(null);
    try {
      const response = await fetch(`/api/runners/${runner.id}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      // Depois do refresh, que zera o erro de listagem e apagaria este na mesma hora.
      await refresh();
      if (!response.ok) setLoadError(data.error || `Failed to ${action} the runner.`);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setBusyRow(null);
    }
  }

  async function handleDelete(runner) {
    if (!window.confirm(`Delete runner "${runner.name}"? Its container will be removed.`)) return;
    setBusyRow({ id: runner.id, action: "delete" });
    try {
      const response = await fetch(`/api/runners/${runner.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) setLoadError(data.error || "Failed to delete the runner.");
      if (editing?.id === runner.id) setEditing(null);
      await refresh();
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setBusyRow(null);
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

      {progress && <CreationProgress progress={progress} mode={progressMode} />}

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
          busyRow={busyRow}
          disabled={busy}
          onLifecycle={handleLifecycle}
          onEdit={setEditing}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </section>
    </div>
  );
}
