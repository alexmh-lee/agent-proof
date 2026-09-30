import Link from "next/link";
import { getDb } from "@/db";
import { requirePageUser } from "@/lib/access";
import { listAgents } from "@/lib/agent-registration";

export default async function AgentsPage() {
  const user = await requirePageUser("email_verified");
  const agents = await listAgents(await getDb(), user.id);

  return (
    <main className="mx-auto max-w-2xl px-5 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Agents</h1>
      <p className="mt-3 text-muted">
        Register agents through the API using a key from your account page.
      </p>
      <ul className="mt-8 space-y-3">
        {agents.length === 0 && (
          <li className="rounded-xl border border-ink/20 p-4 text-muted">
            No agents registered yet.
          </li>
        )}
        {agents.map((agent) => (
          <li
            key={agent.id}
            className="rounded-xl border border-ink/20 bg-paper-bright p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold">{agent.name}</h2>
              <span className="text-sm">{agent.status.replace("_", " ")}</span>
            </div>
            <p className="mt-2 text-muted">{agent.purpose}</p>
            <p className="mt-2 font-mono text-xs text-muted">
              {agent.thumbprint}
            </p>
          </li>
        ))}
      </ul>
      <Link href="/account" className="mt-6 inline-block underline">
        Back to your account
      </Link>
    </main>
  );
}
