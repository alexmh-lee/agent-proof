import { getDb } from "@/db";
import { buildDirectoryResponse } from "@/lib/directory";

export async function GET(request: Request) {
  const host = request.headers.get("host");
  if (!host) {
    return new Response("Not Found", { status: 404 });
  }

  const directory = await buildDirectoryResponse(await getDb(), host);
  if (!directory) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(directory.body, {
    status: 200,
    headers: directory.headers,
  });
}
