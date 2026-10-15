// Formatação compartilhada pelo progresso de criação e pelo painel de consumo.

export function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// Como o `docker stats`: 100% é um núcleo inteiro, então 250% são dois núcleos e meio.
export function formatCpu(percent) {
  const value = Number(percent) || 0;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

function formatMemoryLimit(memoryMb) {
  return memoryMb >= 1024 && memoryMb % 1024 === 0 ? `${memoryMb / 1024} GB` : `${memoryMb} MB`;
}

// Resumo de uma linha dos recursos de um runner, ex.: "2 CPU · 4 GB · host".
export function formatResources(resources) {
  if (!resources) return "";
  const cpu = resources.cpus !== null && resources.cpus !== undefined ? `${resources.cpus} CPU` : "no CPU limit";
  const memory =
    resources.memoryMb !== null && resources.memoryMb !== undefined
      ? formatMemoryLimit(resources.memoryMb)
      : "no memory limit";
  return [cpu, memory, resources.network].filter(Boolean).join(" · ");
}
