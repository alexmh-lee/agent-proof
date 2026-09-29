import Link from "next/link";
import { requirePageUser } from "@/lib/access";

export default async function AgentsPage() {
  await requirePageUser("email_verified");

  return (
    <main className="mx-auto max-w-2xl px-5 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Agents</h1>
      <p className="mt-3 text-muted">
        Agent registration is coming soon. Your account is verified and ready.
      </p>
      <Link href="/account" className="mt-6 inline-block underline">
        Back to your account
      </Link>
    </main>
  );
}
