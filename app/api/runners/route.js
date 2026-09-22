import { NextResponse } from "next/server";
import { createRunner, listRunners } from "@/lib/docker";
import { errorResponse, readRunnerInput } from "@/lib/api-utils";

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
    const runner = await createRunner(await readRunnerInput(request));
    return NextResponse.json({ runner }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
