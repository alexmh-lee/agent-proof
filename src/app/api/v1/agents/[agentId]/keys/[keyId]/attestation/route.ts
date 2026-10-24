import { getDb } from "@/db";
import { authenticateApiKey } from "@/lib/api-keys";
import { DirectoryError, storeDirectoryAttestation } from "@/lib/directory";
import { findPrivateKeyMaterial } from "@/lib/key-material";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/agents/[agentId]/keys/[keyId]/attestation">,
) {
  const db = await getDb();
  const auth = await authenticateApiKey(
    db,
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON request body is required." }, {
      status: 400,
    });
  }

  if (findPrivateKeyMaterial(body).length > 0) {
    console.warn(
      "Rejected a directory attestation request containing private key material.",
    );
    return Response.json(
      { error: "Private key material must never be sent to AgentProof." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "A JSON attestation object is required." }, {
      status: 400,
    });
  }
  const input = body as Record<string, unknown>;
  if (
    typeof input.authority !== "string" ||
    typeof input.signature_input !== "string" ||
    typeof input.signature !== "string"
  ) {
    return Response.json(
      {
        error:
          "authority, signature_input, and signature are required.",
      },
      { status: 400 },
    );
  }
  if (input.label !== undefined && typeof input.label !== "string") {
    return Response.json({ error: "label must be a string when provided." }, {
      status: 400,
    });
  }

  const { agentId, keyId } = await context.params;

  try {
    const saved = await storeDirectoryAttestation(db, {
      accountId: auth.account.id,
      agentId,
      keyId,
      authority: input.authority,
      signatureInput: input.signature_input,
      signature: input.signature,
      label: input.label,
    });
    return Response.json(
      {
        key_id: saved.keyId,
        thumbprint: saved.thumbprint,
        label: saved.label,
        authority: saved.authority,
        content_digest: saved.contentDigest,
        created: saved.created,
        expires: saved.expires,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DirectoryError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
