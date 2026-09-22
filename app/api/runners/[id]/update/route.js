import { NextResponse } from "next/server";
import { updateRunner } from "@/lib/docker";
import { errorResponse, streamRunnerResponse, wantsStream } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// Sem corpo: a atualização reaproveita o registro do próprio container, então não
// há token nem configuração para receber.
export async function POST(request, { params }) {
  try {
    if (wantsStream(request)) {
      return streamRunnerResponse((send) => updateRunner(params.id, send));
    }
    return NextResponse.json({ runner: await updateRunner(params.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
