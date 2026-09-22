import { NextResponse } from "next/server";
import { createRunner, listRunners } from "@/lib/docker";
import { errorResponse, readRunnerInput, streamRunnerResponse, wantsStream } from "@/lib/api-utils";

// O estado vem do daemon a cada requisição; cachear devolveria uma lista morta.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ runners: await listRunners() });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request) {
  try {
    // Ler o corpo antes de abrir o stream: um JSON inválido ainda merece um 400 normal.
    const input = await readRunnerInput(request);
    if (wantsStream(request)) {
      return streamRunnerResponse((send) => createRunner(input, send));
    }
    return NextResponse.json({ runner: await createRunner(input) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
