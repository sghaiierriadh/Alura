import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { message: "Knowledge API — à brancher (placeholder)" },
    { status: 501 },
  );
}
