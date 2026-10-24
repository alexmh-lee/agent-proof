import { getDb } from "@/db";
import {
  accountIdFromHost,
  lookupPublishedKeyMetadata,
} from "@/lib/directory";

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/keys/[thumbprint]">,
) {
  const host = request.headers.get("host");
  if (!host) {
    return Response.json({ error: "Not Found" }, { status: 404 });
  }
  const accountId = accountIdFromHost(host);
  if (!accountId) {
    return Response.json({ error: "Not Found" }, { status: 404 });
  }

  const { thumbprint } = await context.params;
  const metadata = await lookupPublishedKeyMetadata(
    await getDb(),
    accountId,
    thumbprint,
  );
  if (!metadata) {
    return Response.json({ error: "Key not found." }, { status: 404 });
  }

  return Response.json({
    thumbprint: metadata.thumbprint,
    name: metadata.name,
    purpose: metadata.purpose,
    status: metadata.status,
  });
}
