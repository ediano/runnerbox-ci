import { NextResponse } from "next/server";
import { recreateRunner, removeRunner } from "@/lib/docker";
import { errorResponse, readRunnerInput } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function PUT(request, { params }) {
  try {
    const runner = await recreateRunner(params.id, await readRunnerInput(request));
    return NextResponse.json({ runner });
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
