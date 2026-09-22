import { NextResponse } from "next/server";

// Erros do dockerode (socket ausente, permissão negada) são a falha mais provável em
// uso real; sem isto a UI só veria um 500 opaco do Next.
export function errorResponse(err) {
  const status = err?.status || 500;
  const body = { error: err?.message || "Erro inesperado." };
  if (err?.validationErrors) body.errors = err.validationErrors;
  if (err?.code === "ENOENT" || err?.code === "EACCES") {
    body.error =
      "Não foi possível acessar o socket do Docker. Verifique se /var/run/docker.sock está mapeado e acessível.";
  }
  return NextResponse.json(body, { status });
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
