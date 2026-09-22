// Estado da criação de um runner, derivado dos eventos NDJSON. Lógica pura: o
// componente só desenha o que sai daqui.

export const MAX_LOG_LINES = 200;

// A ordem das etapas é a ordem real do backend (lib/docker.js + lib/images.js).
export const STEPS = [
  { id: "removing", label: "Removing the current container" },
  { id: "image", label: "Preparing image" },
  { id: "pull", label: "Downloading base image" },
  { id: "build", label: "Building image" },
  { id: "container", label: "Creating container" },
  { id: "start", label: "Starting runner" },
];

export function emptyProgress() {
  return { phase: null, message: null, logs: [], layers: {}, error: null };
}

export function applyProgressEvent(state, event) {
  switch (event?.type) {
    case "phase":
      return { ...state, phase: event.phase, message: event.message || null };

    case "pull":
      return {
        ...state,
        // Só saímos de "pull" quando o build de fato começa a emitir linhas.
        phase: "pull",
        message: `${event.status}…`,
        layers: {
          ...state.layers,
          [event.layer]: {
            status: event.status,
            current: event.current || 0,
            total: event.total || 0,
          },
        },
      };

    case "log": {
      const logs = [...state.logs, event.message].slice(-MAX_LOG_LINES);
      return { ...state, phase: "build", message: event.message, logs };
    }

    case "done":
      return { ...state, phase: "done", message: null };

    case "error":
      return { ...state, error: event.error || "Unexpected error." };

    default:
      return state;
  }
}

// O pull é paralelo: o percentual que interessa é a soma das camadas, não a de uma.
export function pullTotals(layers) {
  const entries = Object.values(layers || {});
  const current = entries.reduce((sum, layer) => sum + (layer.current || 0), 0);
  const total = entries.reduce((sum, layer) => sum + (layer.total || 0), 0);
  // Sem `total` o progresso é indeterminado (ex.: camadas em "Extracting").
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null;
  return { current, total, percent };
}

export function stepStatus(stepId, phase) {
  if (!phase) return "pending";
  if (phase === "done") return "done";
  const order = STEPS.map((step) => step.id);
  const at = order.indexOf(phase);
  const mine = order.indexOf(stepId);
  if (at < 0 || mine < 0) return "pending";
  if (mine < at) return "done";
  if (mine === at) return "active";
  return "pending";
}

export function busyLabel(phase) {
  switch (phase) {
    case "removing":
      return "Removing…";
    case "image":
      return "Preparing…";
    case "pull":
      return "Downloading…";
    case "build":
      return "Building…";
    case "container":
      return "Creating…";
    case "start":
      return "Starting…";
    default:
      return "Working…";
  }
}

export function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
