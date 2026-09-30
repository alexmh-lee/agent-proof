"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import { requirePageUser } from "@/lib/access";
import {
  checkDomainVerification,
  startDomainVerification,
} from "@/lib/domain";

export async function signInWithEmail(formData: FormData) {
  try {
    await signIn("email", {
      email: String(formData.get("email") ?? ""),
      redirectTo: "/account",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=EmailSignin");
    throw error;
  }
}

export async function signOutAction() {
  await requirePageUser("unverified");
  await signOut({ redirectTo: "/login?signedOut=1" });
}

export async function addDomain(formData: FormData) {
  const user = await requirePageUser("email_verified");
  const result = await startDomainVerification(
    await getDb(),
    user.id,
    String(formData.get("domain") ?? ""),
  );
  if ("error" in result) {
    redirect(`/account?domainError=${encodeURIComponent(result.error)}`);
  }
  redirect("/account");
}

export async function checkDomain() {
  const user = await requirePageUser("email_verified");
  const result = await checkDomainVerification(await getDb(), user.id);
  if (result.error) {
    redirect(`/account?domainError=${encodeURIComponent(result.error)}`);
  }
  redirect("/account");
}
