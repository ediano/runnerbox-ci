import { NextResponse } from "next/server";
import { hostLimits } from "@/lib/docker";
import { errorResponse } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// Tetos de CPU e memória que o formulário mostra ao lado dos campos de limite.
export async function GET() {
  try {
    return NextResponse.json(await hostLimits());
  } catch (err) {
    return errorResponse(err);
  }
}
