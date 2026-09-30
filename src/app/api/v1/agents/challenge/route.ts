import { getDb } from "@/db";
import { authenticateApiKey } from "@/lib/api-keys";
import { createRegistrationChallenge } from "@/lib/agent-registration";

export async function POST(request: Request) {
  const db = await getDb();
  const auth = await authenticateApiKey(
    db,
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const challenge = await createRegistrationChallenge(db, auth.account.id);
  return Response.json(
    {
      challenge_id: challenge.challengeId,
      nonce: challenge.nonce,
      account_id: challenge.accountId,
      directory_authority: challenge.directoryAuthority,
      issued_at: challenge.issuedAt,
      expires_at: challenge.expiresAt.toISOString(),
      proof_format:
        "AgentProof registration proof v1 canonical JSON; see docs/ARCHITECTURE.md",
    },
    { status: 201 },
  );
}
