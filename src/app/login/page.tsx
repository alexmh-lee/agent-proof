import Link from "next/link";
import { redirect } from "next/navigation";
import { authConfigured, getCurrentUser } from "@/auth";
import { signInWithEmail } from "@/app/account/actions";

const ERRORS: Record<string, string> = {
  Verification:
    "That sign-in link is invalid, expired, or has already been used. Request a new one.",
  EmailSignin: "We couldn't send a sign-in link. Check the email address.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, signedOut } = await searchParams;

  if (!authConfigured()) {
    return (
      <main className="mx-auto max-w-md px-5 py-20">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-4 rounded-xl border border-line bg-paper-bright p-4 text-muted">
          Sign-in is not configured on this deployment yet.
        </p>
        <Link href="/" className="mt-6 inline-block underline">
          Back to AgentProof
        </Link>
      </main>
    );
  }

  if (await getCurrentUser()) redirect("/account");

  return (
    <main className="mx-auto max-w-md px-5 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">
        Sign in or create an account
      </h1>
      <p className="mt-3 text-muted">
        We&apos;ll send a one-time sign-in link to your email. Opening it
        verifies your address.
      </p>
      {typeof error === "string" && (
        <p className="mt-4 rounded-xl border border-orange bg-paper-bright p-3">
          {ERRORS[error] ?? "Sign-in failed. Try again."}
        </p>
      )}
      {signedOut && (
        <p className="mt-4 rounded-xl border border-line bg-paper-bright p-3">
          You have been signed out.
        </p>
      )}
      <form action={signInWithEmail} className="mt-6 flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-11 rounded-xl border border-ink bg-paper-bright px-3"
        />
        <button
          type="submit"
          className="h-11 rounded-xl border border-ink bg-ink font-semibold text-paper"
        >
          Email me a sign-in link
        </button>
      </form>
    </main>
  );
}
