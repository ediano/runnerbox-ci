import { NextResponse } from "next/server";
import { recreateRunner, removeRunner } from "@/lib/docker";
import { errorResponse, readRunnerInput, streamRunnerResponse, wantsStream } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function PUT(request, { params }) {
  try {
    const input = await readRunnerInput(request);
    if (wantsStream(request)) {
      return streamRunnerResponse((send) => recreateRunner(params.id, input, send));
    }
    return NextResponse.json({ runner: await recreateRunner(params.id, input) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request, { params }) {
  try {
    await removeRunner(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
