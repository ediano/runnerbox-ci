import { NextResponse } from "next/server";

// Erros do dockerode (socket ausente, permissão negada) são a falha mais provável em
// uso real; sem isto a UI só veria um 500 opaco do Next.
export function errorResponse(err) {
  const status = err?.status || 500;
  const body = { error: err?.message || "Unexpected error." };
  if (err?.validationErrors) body.errors = err.validationErrors;
  // Só culpe o socket quando o erro for mesmo sobre ele: antes, qualquer EACCES
  // (inclusive de escrita em disco) virava uma mensagem enganosa sobre o Docker.
  const isSocketError =
    (err?.code === "ENOENT" || err?.code === "EACCES" || err?.code === "ECONNREFUSED") &&
    String(err?.address || err?.path || "").includes("docker.sock");
  if (isSocketError) {
    body.error =
      "Could not reach the Docker socket. Check that /var/run/docker.sock is mounted and accessible.";
  }
  return NextResponse.json(body, { status });
}

export function warn(message, err) {
  console.warn(`runnerbox: ${message}`, err?.message || "");
}

export async function readRunnerInput(request) {
  const body = await request.json();
  return {
    platform: body.platform,
    url: typeof body.url === "string" ? body.url.trim() : body.url,
    token: typeof body.token === "string" ? body.token.trim() : body.token,
    name: body.name,
  };
}
