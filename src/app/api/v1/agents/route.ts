import { requireApiUser } from "@/lib/access";

// Agent registration arrives in Phase 2. The trust-level gate is in place
// now so unverified accounts can never reach it.
export async function GET() {
  const access = await requireApiUser("email_verified");
  if ("response" in access) return access.response;
  return Response.json(
    { error: "Agent registration is not available yet." },
    { status: 501 },
  );
}

export const POST = GET;
