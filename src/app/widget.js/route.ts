import { NextResponse } from "next/server";
import { buildWidgetLauncherScript, resolveWidgetOrigin } from "@/lib/widget/embed-script";

export const dynamic = "force-dynamic";

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  return res;
}

export async function OPTIONS() {
  return withCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: Request) {
  const js = buildWidgetLauncherScript(resolveWidgetOrigin(req));
  const res = new NextResponse(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
  return withCorsHeaders(res);
}

