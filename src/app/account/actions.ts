"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import { requirePageUser } from "@/lib/access";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
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

export type CreateApiKeyState = {
  rawKey?: string;
  error?: string;
};

export async function createApiKeyAction(
  _previous: CreateApiKeyState,
  formData: FormData,
): Promise<CreateApiKeyState> {
  const user = await requirePageUser("email_verified");
  try {
    const result = await createApiKey(
      await getDb(),
      user.id,
      String(formData.get("label") ?? ""),
    );
    revalidatePath("/account");
    return { rawKey: result.rawKey };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "The API key was not created.",
    };
  }
}

export async function revokeApiKeyAction(formData: FormData) {
  const user = await requirePageUser("email_verified");
  await revokeApiKey(
    await getDb(),
    user.id,
    String(formData.get("keyId") ?? ""),
  );
  revalidatePath("/account");
}
