import { NextResponse } from "next/server";
import { restartRunner, startRunner, stopRunner } from "@/lib/docker";
import { RUNNER_ACTIONS } from "@/lib/runner-spec";
import { errorResponse } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const HANDLERS = { start: startRunner, stop: stopRunner, restart: restartRunner };

// Sem streaming: parar ou iniciar um container leva segundos, não há build no caminho.
export async function POST(request, { params }) {
  try {
    const { action } = await request.json();
    if (!RUNNER_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Action must be one of: ${RUNNER_ACTIONS.join(", ")}.` },
        { status: 400 }
      );
    }
    return NextResponse.json({ runner: await HANDLERS[action](params.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
