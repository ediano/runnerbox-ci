"use client";

import { useEffect, useState } from "react";
import PlatformCards from "./PlatformCards";
import { busyLabel } from "@/lib/creation-progress";

const FIELD_COPY = {
  github: {
    urlLabel: "Repository or organization URL",
    urlPlaceholder: "https://github.com/my-org/my-repo",
    urlHint: "An owner/repo URL registers at the repository; owner only registers at the organization.",
    tokenLabel: "GitHub registration token",
    tokenHint: "Settings → Actions → Runners → New self-hosted runner.",
  },
  gitlab: {
    urlLabel: "GitLab URL",
    urlPlaceholder: "https://gitlab.com",
    urlHint: "Use the instance URL; the scope (group or project) comes from the token itself.",
    tokenLabel: "GitLab registration token",
    tokenHint: "Accepts a registration token or an authentication token (glrt-…).",
  },
};

const EMPTY = { platform: "github", url: "", token: "", name: "" };

export default function RunnerForm({ editing, onSubmit, onCancelEdit, busy, busyPhase }) {
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
          {editing ? `Edit runner: ${editing.name}` : "New runner"}
        </h2>
        <p className="text-sm text-slate-400">
          {editing
            ? tokenOptional
              ? "Updating recreates the container. Leave the token blank to reuse the current one."
              : "Updating recreates the container, so the token must be provided again."
            : "Pick a platform and provide the registration credentials."}
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
          label={tokenOptional ? `${copy.tokenLabel} (optional)` : copy.tokenLabel}
          hint={tokenOptional ? "Leave blank to reuse the current token." : copy.tokenHint}
        >
          <input
            type="password"
            required={!tokenOptional}
            value={form.token}
            onChange={set("token")}
            autoComplete="off"
            placeholder={tokenOptional ? "Keeps the current token" : "••••••••••••"}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-slate-400"
          />
        </Field>

        <Field label="Runner name (optional)" hint="Becomes the child container suffix.">
          <input
            type="text"
            value={form.name}
            onChange={set("name")}
            placeholder="my-runner"
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
            {busy ? busyLabel(busyPhase) : editing ? "Recreate runner" : "Create runner"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={busy}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium transition hover:bg-slate-800 disabled:opacity-60"
            >
              Cancel
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
