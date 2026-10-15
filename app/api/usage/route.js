import { NextResponse } from "next/server";
import { collectUsage } from "@/lib/docker";
import { errorResponse } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// `?disk=1` inclui o disco por container e o `docker system df`, que são lentos; sem
// ele a resposta traz só CPU e memória e pode ser consultada com frequência.
export async function GET(request) {
  try {
    const disk = new URL(request.url).searchParams.get("disk") === "1";
    return NextResponse.json(await collectUsage({ disk }));
  } catch (err) {
    return errorResponse(err);
  }
}
