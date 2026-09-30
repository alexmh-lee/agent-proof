import type { NextRequest } from "next/server";
import { authConfigured, handlers } from "@/auth";

function notConfigured() {
  return Response.json(
    { error: "Sign-in is not configured on this deployment yet." },
    { status: 503 },
  );
}

export function GET(request: NextRequest) {
  return authConfigured() ? handlers.GET(request) : notConfigured();
}

export function POST(request: NextRequest) {
  return authConfigured() ? handlers.POST(request) : notConfigured();
}
