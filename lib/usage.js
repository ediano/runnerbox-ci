// Lógica pura do painel de consumo: transforma o que o daemon devolve (listContainers,
// stats, df) em números legíveis. Como runner-spec.js, não importa dockerode.
import { LABEL_MANAGED, LABEL_NAME, LABEL_ROLE, LABEL_RUNNER } from "./constants.js";

// Label que o próprio gitlab-runner põe em todo container que cria para um job.
const GITLAB_JOB_LABEL = "com.gitlab.gitlab-runner.managed";

export const USAGE_KINDS = ["panel", "runner", "job", "other"];

// Mesma conta do `docker stats`: a fatia do tempo de CPU da máquina que o container
// usou entre as duas amostras, escalada pelo número de CPUs. 100% = um núcleo inteiro.
export function cpuPercent(stats) {
  const cpu = stats?.cpu_stats;
  const pre = stats?.precpu_stats;
  if (!cpu?.cpu_usage || !pre?.cpu_usage) return 0;
  const cpuDelta = cpu.cpu_usage.total_usage - pre.cpu_usage.total_usage;
  const systemDelta = (cpu.system_cpu_usage || 0) - (pre.system_cpu_usage || 0);
  const online = cpu.online_cpus || cpu.cpu_usage.percpu_usage?.length || 1;
  if (cpuDelta <= 0 || systemDelta <= 0) return 0;
  return (cpuDelta / systemDelta) * online * 100;
}

// Também como o CLI: o page cache inativo é memória que o kernel devolve sob pressão,
// e contá-lo faria um runner ocioso parecer cheio. cgroup v2 usa `inactive_file`; v1,
// `total_inactive_file`.
export function memoryUsage(stats) {
  const memory = stats?.memory_stats || {};
  const usage = memory.usage || 0;
  const inner = memory.stats || {};
  const inactive = inner.inactive_file ?? inner.total_inactive_file ?? 0;
  const used = inactive < usage ? usage - inactive : usage;
  const limit = memory.limit || 0;
  return { used, limit, percent: limit ? (used / limit) * 100 : 0 };
}

// Quem é cada container: o próprio painel, um runner, um job de um runner ou qualquer
// outro container do host (inclusive `services:` de jobs do GitHub, que o runner do
// GitHub cria sem nenhuma marca que permita atribuí-los).
export function classifyContainer(info, selfId) {
  const labels = info?.Labels || {};
  const name = String(info?.Names?.[0] || "").replace(/^\//, "") || String(info?.Id || "").slice(0, 12);

  if (labels[LABEL_ROLE] === "panel" || (selfId && String(info?.Id || "").startsWith(selfId))) {
    return { kind: "panel", name, runner: null };
  }
  if (labels[LABEL_MANAGED] === "true") {
    return { kind: "runner", name, runner: labels[LABEL_NAME] || name };
  }
  if (labels[LABEL_RUNNER] || labels[GITLAB_JOB_LABEL]) {
    return { kind: "job", name, runner: labels[LABEL_RUNNER] || null };
  }
  return { kind: "other", name, runner: null };
}

export function buildUsageEntry(info, stats, selfId) {
  const memory = memoryUsage(stats);
  return {
    id: info.Id,
    ...classifyContainer(info, selfId),
    state: info.State || "unknown",
    cpuPercent: cpuPercent(stats),
    memoryBytes: memory.used,
    memoryLimitBytes: memory.limit,
    // SizeRw só vem quando o disco foi pedido (listContainers com size: true).
    diskBytes: typeof info.SizeRw === "number" ? info.SizeRw : null,
  };
}

// CPU do próprio processo do painel quando ele não roda em container (ex.: `npm run dev`):
// mesmo referencial do `docker stats`, 100% = um núcleo.
export function processCpuPercent(previous, current) {
  if (!previous || !current) return 0;
  const elapsedMicros = (current.at - previous.at) * 1000;
  const usedMicros = current.user + current.system - (previous.user + previous.system);
  if (elapsedMicros <= 0 || usedMicros <= 0) return 0;
  return (usedMicros / elapsedMicros) * 100;
}

function topBy(entries, key) {
  return entries.reduce((best, entry) => {
    if (typeof entry[key] !== "number") return best;
    return !best || entry[key] > best[key] ? entry : best;
  }, null);
}

function emptyTotals() {
  return { count: 0, cpuPercent: 0, memoryBytes: 0, diskBytes: 0 };
}

function addTo(totals, entry) {
  totals.count += 1;
  totals.cpuPercent += entry.cpuPercent || 0;
  totals.memoryBytes += entry.memoryBytes || 0;
  totals.diskBytes += entry.diskBytes || 0;
}

// Totais por tipo, por runner (o runner somado aos seus jobs) e o maior consumidor de
// cada recurso: é o que responde "quem está pesando na máquina".
export function summarizeUsage(entries) {
  const byKind = Object.fromEntries(USAGE_KINDS.map((kind) => [kind, emptyTotals()]));
  const byRunner = {};
  const total = emptyTotals();

  for (const entry of entries) {
    addTo(total, entry);
    addTo(byKind[entry.kind] || byKind.other, entry);
    if (entry.runner && (entry.kind === "runner" || entry.kind === "job")) {
      byRunner[entry.runner] ||= emptyTotals();
      addTo(byRunner[entry.runner], entry);
    }
  }

  const top = (key) => {
    const entry = topBy(entries, key);
    return entry && entry[key] > 0 ? { id: entry.id, name: entry.name, kind: entry.kind, value: entry[key] } : null;
  };

  return {
    total,
    byKind,
    byRunner,
    top: { cpu: top("cpuPercent"), memory: top("memoryBytes"), disk: top("diskBytes") },
  };
}

// `docker system df` resumido no que ocupa disco no host por causa dos runners e jobs.
export function summarizeDiskUsage(df) {
  const sum = (items, pick) => (items || []).reduce((acc, item) => acc + Math.max(0, pick(item) || 0), 0);
  const images = df?.LayersSize || 0;
  const containers = sum(df?.Containers, (c) => c.SizeRw);
  const volumes = sum(df?.Volumes, (v) => v.UsageData?.Size);
  const buildCache = sum(df?.BuildCache, (b) => (b.Shared ? 0 : b.Size));
  return { images, containers, volumes, buildCache, total: images + containers + volumes + buildCache };
}

// As medições rápidas (sem disco) não podem apagar o disco da última medição completa:
// ele é carregado por id até a próxima, e o resumo é refeito com os valores juntos.
export function mergeUsage(previous, next) {
  if (!next) return previous;
  const measuredDisk = next.host?.disk || next.containers.some((entry) => entry.diskBytes !== null);
  if (measuredDisk || !previous) return next;

  const previousDisk = new Map(previous.containers.map((entry) => [entry.id, entry.diskBytes]));
  const containers = next.containers.map((entry) =>
    entry.diskBytes === null && previousDisk.get(entry.id) != null
      ? { ...entry, diskBytes: previousDisk.get(entry.id) }
      : entry
  );
  return {
    ...next,
    host: { ...next.host, disk: previous.host?.disk || null },
    containers,
    summary: summarizeUsage(containers),
  };
}
