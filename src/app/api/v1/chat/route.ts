import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    { message: "Chat API — à brancher (placeholder)" },
    { status: 501 },
  );
}
