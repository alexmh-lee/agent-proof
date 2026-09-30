import { MAGIC_LINK_MAX_AGE_SECONDS } from "@/lib/auth-config";

export default function CheckEmailPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
      <p className="mt-3 text-muted">
        We sent you a sign-in link. It works once and expires in{" "}
        {MAGIC_LINK_MAX_AGE_SECONDS / 60} minutes.
      </p>
    </main>
  );
}
