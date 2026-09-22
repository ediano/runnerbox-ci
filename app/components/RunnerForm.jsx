"use client";

import { useEffect, useState } from "react";
import PlatformCards from "./PlatformCards";

const FIELD_COPY = {
  github: {
    urlLabel: "URL do repositório ou organização",
    urlPlaceholder: "https://github.com/minha-org/meu-repo",
    urlHint: "Uma URL com owner/repo registra no repositório; só com o owner, na organização.",
    tokenLabel: "Registration token do GitHub",
    tokenHint: "Settings → Actions → Runners → New self-hosted runner.",
  },
  gitlab: {
    urlLabel: "URL do GitLab",
    urlPlaceholder: "https://gitlab.com",
    urlHint: "Use a URL da instância; o escopo (grupo ou projeto) vem do próprio token.",
    tokenLabel: "Registration token do GitLab",
    tokenHint: "Aceita registration token ou authentication token (glrt-…).",
  },
};

const EMPTY = { platform: "github", url: "", token: "", name: "" };

export default function RunnerForm({ editing, onSubmit, onCancelEdit, busy }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    // Ao entrar em modo edição, reaproveitamos URL e nome; o token nunca é persistido.
    if (editing) {
      setForm({
        platform: editing.platform,
        url: editing.url,
        token: "",
        name: editing.name,
      });
    } else {
      setForm(EMPTY);
    }
    setErrors([]);
  }, [editing]);

  const copy = FIELD_COPY[form.platform] || FIELD_COPY.github;
  // Ao editar, o token guardado cifrado é reutilizado se o campo ficar vazio.
  const tokenOptional = Boolean(editing?.hasStoredToken);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors([]);
    const result = await onSubmit(form);
    if (result?.errors?.length) setErrors(result.errors);
    else if (result?.error) setErrors([result.error]);
    else setForm(EMPTY);
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">
          {editing ? `Editar runner: ${editing.name}` : "Novo runner"}
        </h2>
        <p className="text-sm text-slate-400">
          {editing
            ? tokenOptional
              ? "A atualização recria o container. Deixe o token em branco para reaproveitar o atual."
              : "A atualização recria o container, então o token precisa ser informado novamente."
            : "Escolha a plataforma e informe as credenciais de registro."}
        </p>
      </div>

      <PlatformCards
        value={form.platform}
        onChange={(platform) => setForm((prev) => ({ ...prev, platform }))}
        disabled={busy || Boolean(editing)}
      />

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <Field label={copy.urlLabel} hint={copy.urlHint}>
          <input
            type="url"
            required
            value={form.url}
            onChange={set("url")}
            placeholder={copy.urlPlaceholder}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-slate-400"
          />
        </Field>

        <Field
          label={tokenOptional ? `${copy.tokenLabel} (opcional)` : copy.tokenLabel}
          hint={tokenOptional ? "Em branco, o token atual é reaproveitado." : copy.tokenHint}
        >
          <input
            type="password"
            required={!tokenOptional}
            value={form.token}
            onChange={set("token")}
            autoComplete="off"
            placeholder={tokenOptional ? "Mantém o token atual" : "••••••••••••"}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-slate-400"
          />
        </Field>

        <Field label="Nome do runner (opcional)" hint="Vira o sufixo do container filho.">
          <input
            type="text"
            value={form.name}
            onChange={set("name")}
            placeholder="meu-runner"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-slate-400"
          />
        </Field>

        {errors.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-300">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-white disabled:opacity-60"
          >
            {busy ? "Processando…" : editing ? "Recriar runner" : "Criar runner"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={busy}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium transition hover:bg-slate-800 disabled:opacity-60"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
