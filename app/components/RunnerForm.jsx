"use client";

import { useEffect, useRef, useState } from "react";
import PlatformCards from "./PlatformCards";
import { busyLabel } from "@/lib/creation-progress";
import { parseRegisterCommand } from "@/lib/register-command";

const FIELD_COPY = {
  github: {
    urlLabel: "Repository or organization URL",
    urlPlaceholder: "https://github.com/my-org/my-repo",
    urlHint:
      "An owner/repo URL registers at the repository; owner only registers at the organization. Pasting the whole ./config.sh command fills URL and token.",
    tokenLabel: "GitHub registration token",
    tokenHint: "Settings → Actions → Runners → New self-hosted runner.",
    resourcesHint:
      "Steps run inside the runner container, so they share these limits. Containers a job starts (services, docker build) are not limited.",
  },
  gitlab: {
    urlLabel: "GitLab URL",
    urlPlaceholder: "https://gitlab.com",
    urlHint:
      "Use the instance URL; the scope (group or project) comes from the token itself. Pasting the whole gitlab-runner register command fills URL and token.",
    tokenLabel: "GitLab registration token",
    tokenHint: "Accepts a registration token or an authentication token (glrt-…).",
    resourcesHint: "Jobs run in their own containers; each job container gets the same CPU and memory limits.",
  },
};

const NETWORK_OPTIONS = [
  {
    id: "host",
    title: "Host",
    description: "Shares the machine's network, like a process installed on it.",
  },
  {
    id: "bridge",
    title: "Bridge",
    description: "Isolated in Docker's default network; reaches the internet through NAT.",
  },
];

// Atalhos para os limites mais comuns; o campo continua aceitando qualquer valor.
const MEMORY_PRESETS = [
  { label: "256 MB", memory: "256", memoryUnit: "MB" },
  { label: "512 MB", memory: "512", memoryUnit: "MB" },
  { label: "1 GB", memory: "1", memoryUnit: "GB" },
  { label: "2 GB", memory: "2", memoryUnit: "GB" },
  { label: "4 GB", memory: "4", memoryUnit: "GB" },
  { label: "8 GB", memory: "8", memoryUnit: "GB" },
];

const CPU_PRESETS = ["0.1", "0.25", "0.5", "1", "2", "4", "8"].map((cpus) => ({
  label: `${cpus} CPU`,
  cpus,
}));

// Um runner novo já começa com 2 vCPUs e 8 GB, nas duas plataformas.
const EMPTY = {
  platform: "github",
  url: "",
  token: "",
  name: "",
  memory: "8",
  memoryUnit: "GB",
  cpus: "2",
  network: "host",
};

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-slate-400";

// Mostra o limite salvo na unidade mais legível: 4096 MB vira "4 GB".
function memoryFields(memoryMb) {
  if (!memoryMb) return { memory: "", memoryUnit: "GB" };
  if (memoryMb % 1024 === 0) return { memory: String(memoryMb / 1024), memoryUnit: "GB" };
  return { memory: String(memoryMb), memoryUnit: "MB" };
}

// O formulário trabalha com texto e unidade; a API recebe MB inteiros e núcleos.
function toPayload(form) {
  const { memory, memoryUnit, ...rest } = form;
  const amount = Number(memory);
  // Vazio segue vazio (sem limite); um valor inválido vai como veio, para a API explicar.
  if (memory === "" || Number.isNaN(amount)) return { ...rest, memoryMb: memory };
  return { ...rest, memoryMb: Math.round(memoryUnit === "GB" ? amount * 1024 : amount) };
}

// Algo foi digitado além do ponto de partida? A plataforma não conta: escolhê-la é o
// clique que abre o formulário.
function isDirty(form, initial) {
  return Object.keys(EMPTY).some((key) => key !== "platform" && form[key] !== initial[key]);
}

function initialFor(editing) {
  if (!editing) return EMPTY;
  // Ao editar, reaproveitamos URL, nome e recursos; o token nunca é persistido.
  return {
    platform: editing.platform,
    url: editing.url,
    token: "",
    name: editing.name,
    ...memoryFields(editing.resources?.memoryMb),
    cpus: editing.resources?.cpus ? String(editing.resources.cpus) : "",
    network: editing.resources?.network || "host",
  };
}

export default function RunnerForm({ editing, onSubmit, onCancelEdit, busy, busyPhase, collapseSignal }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState([]);
  const [host, setHost] = useState(null);
  // Os campos ficam recolhidos até alguém escolher uma plataforma ou editar um runner.
  const [open, setOpen] = useState(false);
  const sectionRef = useRef(null);
  const dirty = isDirty(form, initialFor(editing));
  // O efeito de recolher roda fora do render e precisa do valor mais recente.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Tetos da máquina para os campos de limite; sem eles o formulário segue funcionando.
  useEffect(() => {
    fetch("/api/host", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setHost)
      .catch(() => setHost(null));
  }, []);

  useEffect(() => {
    setForm(initialFor(editing));
    setErrors([]);
    setOpen(Boolean(editing));
    // O botão Edit fica na tabela, abaixo do formulário: leva a pessoa até ele.
    if (editing) sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);

  // Depois de uma ação numa linha (Update, Start, Delete…), o formulário volta a ficar
  // recolhido, a menos que haja algo digitado nele: isso não pode se perder.
  useEffect(() => {
    if (collapseSignal && !dirtyRef.current) setOpen(false);
  }, [collapseSignal]);

  const copy = FIELD_COPY[form.platform] || FIELD_COPY.github;
  // Ao editar, o token guardado cifrado é reutilizado se o campo ficar vazio.
  const tokenOptional = Boolean(editing?.hasStoredToken);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors([]);
    const result = await onSubmit(toPayload(form));
    if (result?.errors?.length) setErrors(result.errors);
    else if (result?.error) setErrors([result.error]);
    else {
      setForm(EMPTY);
      setOpen(false);
    }
  }

  // Colar o comando de registro inteiro em URL ou token preenche os dois campos.
  function handlePaste(event) {
    const parsed = parseRegisterCommand(event.clipboardData.getData("text"));
    if (!parsed) return;
    event.preventDefault();
    setForm((prev) => ({ ...prev, url: parsed.url, token: parsed.token, name: prev.name || parsed.name || "" }));
  }

  function handleClose() {
    if (dirty && !window.confirm("Discard what you have entered?")) return;
    setForm(EMPTY);
    setErrors([]);
    setOpen(false);
    if (editing) onCancelEdit();
  }

  function handlePickPlatform(platform) {
    setForm((prev) => ({ ...prev, platform }));
    setOpen(true);
  }

  return (
    <section ref={sectionRef} className="scroll-mt-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold">
          {editing ? `Edit runner: ${editing.name}` : "New runner"}
        </h2>
        <p className="text-sm text-slate-400">
          {editing
            ? tokenOptional
              ? "Updating recreates the container. Leave the token blank to reuse the current one."
              : "Updating recreates the container, so the token must be provided again."
            : open
              ? "Provide the registration credentials."
              : "Pick a platform to add a runner."}
        </p>
      </div>

      <PlatformCards
        value={open ? form.platform : null}
        onChange={handlePickPlatform}
        disabled={busy || Boolean(editing)}
      />

      {open && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Field label={copy.urlLabel} hint={copy.urlHint}>
            <input
              type="url"
              required
              value={form.url}
              onChange={set("url")}
              onPaste={handlePaste}
              placeholder={copy.urlPlaceholder}
              className={INPUT_CLASS}
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
              onPaste={handlePaste}
              autoComplete="off"
              placeholder={tokenOptional ? "Keeps the current token" : "••••••••••••"}
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Runner name (optional)" hint="Becomes the child container suffix.">
            <input
              type="text"
              value={form.name}
              onChange={set("name")}
              placeholder="my-runner"
              className={INPUT_CLASS}
            />
          </Field>

          <fieldset className="space-y-3 border-t border-slate-800 pt-4">
            <legend className="sr-only">Resources</legend>
            <div>
              <span className="block text-sm font-medium">Resources</span>
              <span className="block text-xs text-slate-400">{copy.resourcesHint}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Memory limit (optional)"
                hint={host ? `Empty means no limit. Host has ${formatHostMemory(host.memoryMb)}.` : "Empty means no limit."}
              >
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.memory}
                    onChange={set("memory")}
                    placeholder="No limit"
                    className={INPUT_CLASS}
                  />
                  <select
                    value={form.memoryUnit}
                    onChange={set("memoryUnit")}
                    aria-label="Memory unit"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 outline-none focus:border-slate-400"
                  >
                    <option value="GB">GB</option>
                    <option value="MB">MB</option>
                  </select>
                </div>
                <Presets
                  options={MEMORY_PRESETS}
                  isActive={(preset) =>
                    form.memoryUnit === preset.memoryUnit && Number(form.memory) === Number(preset.memory)
                  }
                  onPick={({ memory, memoryUnit }) => setForm((prev) => ({ ...prev, memory, memoryUnit }))}
                  onClear={() => setForm((prev) => ({ ...prev, memory: "", memoryUnit: "GB" }))}
                />
              </Field>

              <Field
                label="CPU limit (optional)"
                hint={host ? `Cores, e.g. 1.5. Host has ${host.cpus} CPUs.` : "Cores, e.g. 1.5."}
              >
                <input
                  type="number"
                  min="0.1"
                  max={host?.cpus}
                  step="any"
                  value={form.cpus}
                  onChange={set("cpus")}
                  placeholder="No limit"
                  className={INPUT_CLASS}
                />
                <Presets
                  options={CPU_PRESETS}
                  isActive={(preset) => form.cpus !== "" && Number(form.cpus) === Number(preset.cpus)}
                  onPick={({ cpus }) => setForm((prev) => ({ ...prev, cpus }))}
                  onClear={() => setForm((prev) => ({ ...prev, cpus: "" }))}
                />
              </Field>
            </div>

            <div className="space-y-1">
              <span className="block text-sm font-medium">Network</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {NETWORK_OPTIONS.map((option) => {
                  const selected = form.network === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, network: option.id }))}
                      aria-pressed={selected}
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        selected
                          ? "border-slate-100 bg-slate-800 ring-1 ring-slate-100"
                          : "border-slate-700 bg-slate-950 hover:border-slate-500"
                      }`}
                    >
                      <span className="block text-sm font-medium">{option.title}</span>
                      <span className="block text-xs text-slate-400">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </fieldset>

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
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium transition hover:bg-slate-800 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Presets({ options, isActive, onPick, onClear }) {
  // Os botões vivem dentro do <label> do Field: sem o preventDefault, cada clique
  // também devolveria o foco ao input.
  const handle = (action) => (event) => {
    event.preventDefault();
    action();
  };
  const base = "rounded-full border px-2.5 py-1 text-xs font-medium transition";
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {options.map((option) => {
        const active = isActive(option);
        return (
          <button
            key={option.label}
            type="button"
            onClick={handle(() => onPick(option))}
            aria-pressed={active}
            className={`${base} ${
              active ? "border-slate-100 bg-slate-100 text-slate-900" : "border-slate-700 hover:bg-slate-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={handle(onClear)}
        className={`${base} border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200`}
      >
        Clear
      </button>
    </div>
  );
}

function formatHostMemory(memoryMb) {
  return memoryMb >= 1024 ? `${(memoryMb / 1024).toFixed(1)} GB` : `${memoryMb} MB`;
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
