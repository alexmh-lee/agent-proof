import { getDb } from "@/db";
import { authenticateApiKey } from "@/lib/api-keys";
import {
  listAgents,
  registerAgent,
  RegistrationError,
} from "@/lib/agent-registration";

async function authenticate(request: Request) {
  const db = await getDb();
  const auth = await authenticateApiKey(
    db,
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    return {
      response: Response.json({ error: auth.error }, { status: auth.status }),
    } as const;
  }
  return { db, auth } as const;
}

export async function GET(request: Request) {
  const access = await authenticate(request);
  if ("response" in access) return access.response;
  const rows = await listAgents(access.db, access.auth.account.id);
  return Response.json({
    agents: rows.map((row) => ({
      id: row.id,
      name: row.name,
      purpose: row.purpose,
      status: row.status,
      created_at: row.createdAt.toISOString(),
      last_active_at: row.lastActiveAt?.toISOString() ?? null,
      key: {
        id: row.keyId,
        public_jwk: row.publicJwk,
        thumbprint: row.thumbprint,
        status: row.keyStatus,
      },
    })),
  });
}

export async function POST(request: Request) {
  const access = await authenticate(request);
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON request body is required." }, {
      status: 400,
    });
  }

  try {
    const agent = await registerAgent(
      access.db,
      {
        id: access.auth.account.id,
        trustLevel: access.auth.account.trustLevel,
      },
      body,
    );
    return Response.json(
      {
        id: agent.id,
        name: agent.name,
        purpose: agent.purpose,
        status: agent.status,
        created_at: agent.createdAt.toISOString(),
        key: {
          id: agent.key.id,
          public_jwk: agent.key.publicJwk,
          thumbprint: agent.key.thumbprint,
          status: agent.key.status,
          created_at: agent.key.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RegistrationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
