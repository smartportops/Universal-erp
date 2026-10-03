"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { clearChallenge, createSession, destroySession, readChallenge, setChallenge } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { take: 1 } },
  });
  const membership = user?.memberships[0];
  if (!user || !membership || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=" + encodeURIComponent("Email or password is incorrect."));
  }
  if (user.totpEnabled) {
    await setChallenge(user.id);
    redirect("/login?step=totp");
  }
  await createSession(user.id, membership.id, membership.organizationId);
  redirect("/");
}

export async function confirmLoginTotp(formData: FormData) {
  const userId = await readChallenge();
  if (!userId) redirect("/login?error=" + encodeURIComponent("Sign-in expired. Please try again."));
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { memberships: { take: 1 } } });
  const membership = user?.memberships[0];
  const code = String(formData.get("code") || "");
  if (!user || !membership || !user.totpSecret || !verifyTotp(user.totpSecret, code)) {
    redirect("/login?step=totp&error=" + encodeURIComponent("Code is invalid."));
  }
  await clearChallenge();
  await createSession(user.id, membership.id, membership.organizationId);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
