import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/auth";
import { TRUST_LEVELS, type TrustLevel } from "@/db/schema";

export function meetsTrustLevel(actual: TrustLevel, required: TrustLevel) {
  return TRUST_LEVELS.indexOf(actual) >= TRUST_LEVELS.indexOf(required);
}

export async function requirePageUser(
  required: TrustLevel,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!meetsTrustLevel(user.trustLevel, required)) redirect("/account");
  return user;
}

export async function requireApiUser(
  required: TrustLevel,
): Promise<{ user: CurrentUser } | { response: Response }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: Response.json({ error: "Sign in required." }, { status: 401 }),
    };
  }
  if (!meetsTrustLevel(user.trustLevel, required)) {
    return {
      response: Response.json(
        { error: `Account must be ${required} to use this endpoint.` },
        { status: 403 },
      ),
    };
  }
  return { user };
}
