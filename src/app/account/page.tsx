import Link from "next/link";
import { requirePageUser, meetsTrustLevel } from "@/lib/access";
import { txtRecordName, txtRecordValue } from "@/lib/domain";
import { addDomain, checkDomain, signOutAction } from "./actions";

const TRUST_LABELS = {
  unverified: "Unverified",
  email_verified: "Email verified",
  domain_verified: "Domain verified",
};

export default async function AccountPage({
  searchParams,
}: PageProps<"/account">) {
  const user = await requirePageUser("unverified");
  const { domainError } = await searchParams;
  const canVerifyDomain = meetsTrustLevel(user.trustLevel, "email_verified");

  return (
    <main className="mx-auto max-w-2xl px-5 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>
      <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
        <dt className="text-muted">Email</dt>
        <dd>{user.email}</dd>
        <dt className="text-muted">Trust level</dt>
        <dd>{TRUST_LABELS[user.trustLevel]}</dd>
      </dl>

      {canVerifyDomain ? (
        <Link href="/agents" className="mt-6 inline-block underline">
          Agents
        </Link>
      ) : (
        <p className="mt-6 text-muted">
          Verify your email to register agents.
        </p>
      )}

      {canVerifyDomain && (
        <section className="mt-10 rounded-2xl border border-ink bg-paper-bright p-6">
          <h2 className="text-xl font-semibold">Domain verification</h2>
          <p className="mt-2 text-muted">
            Optional. Proving you control a domain raises your agent limits.
          </p>
          {typeof domainError === "string" && (
            <p className="mt-4 rounded-xl border border-orange p-3">
              {domainError}
            </p>
          )}
          {user.domain && user.domainToken && !user.domainVerifiedAt && (
            <div className="mt-4">
              <p>
                Add this DNS TXT record for <strong>{user.domain}</strong>,
                then check it:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-ink p-3 font-mono text-sm text-paper">
                {`${txtRecordName(user.domain)}  TXT  "${txtRecordValue(user.domainToken)}"`}
              </pre>
              <form action={checkDomain} className="mt-3">
                <button
                  type="submit"
                  className="h-10 rounded-xl border border-ink bg-lime px-4 font-semibold"
                >
                  Check DNS record
                </button>
              </form>
            </div>
          )}
          {user.domainVerifiedAt && (
            <p className="mt-4">
              <strong>{user.domain}</strong> verified on{" "}
              {user.domainVerifiedAt.toISOString().slice(0, 10)}.
            </p>
          )}
          <form action={addDomain} className="mt-6 flex gap-2">
            <input
              name="domain"
              required
              placeholder="example.com"
              aria-label="Domain"
              className="h-10 flex-1 rounded-xl border border-ink bg-paper px-3"
            />
            <button
              type="submit"
              className="h-10 rounded-xl border border-ink px-4 font-semibold"
            >
              {user.domain ? "Use a different domain" : "Add domain"}
            </button>
          </form>
        </section>
      )}

      <form action={signOutAction} className="mt-10">
        <button type="submit" className="underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
