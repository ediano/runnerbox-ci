import { NextResponse } from "next/server";

// Erros do dockerode (socket ausente, permissão negada) são a falha mais provável em
// uso real; sem isto a UI só veria um 500 opaco do Next.
export function errorBody(err) {
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
  return body;
}

export function errorResponse(err) {
  return NextResponse.json(errorBody(err), { status: err?.status || 500 });
}

// A criação pode levar minutos (build da imagem). Com `Accept: application/x-ndjson`
// a rota responde em streaming — uma linha JSON por evento — para que o painel mostre
// em que passo está em vez de um botão parado. Sem o header, nada muda.
export function wantsStream(request) {
  return (request.headers.get("accept") || "").includes("application/x-ndjson");
}

export function streamRunnerResponse(run) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const runner = await run(send);
        send({ type: "done", runner });
      } catch (err) {
        // O status HTTP já foi 200 quando o stream abriu, então o erro viaja no corpo.
        send({ type: "error", ...errorBody(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      // Sem isto um proxy bufferizando entregaria todo o progresso de uma vez, no fim.
      "X-Accel-Buffering": "no",
    },
  });
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
