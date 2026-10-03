"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { clearChallenge, createSession, destroySession, readChallenge, setChallenge } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { record } from "@/server/domain/platform";
import { provisionOrganization } from "@/server/domain/tenant";

export async function register(formData: FormData) {
  const companyName = String(formData.get("company") || "").trim();
  const ownerName = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fail = (message: string) => redirect("/signup?error=" + encodeURIComponent(message));

  if (!companyName || !ownerName || !email) fail("Please fill in all fields.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Please enter a valid email address.");
  if (password.length < 8) fail("The password needs at least 8 characters.");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    fail("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(password);
  const created = await prisma.$transaction(async (tx) => {
    const result = await provisionOrganization(tx, { companyName, ownerName, email, passwordHash });
    await record(tx, {
      organizationId: result.organization.id,
      actorId: result.user.id,
      type: "organization.created",
      entityType: "organization",
      entityId: result.organization.id,
      summary: "Company created.",
    });
    return result;
  });
  await createSession(created.user.id, created.membership.id, created.organization.id);
  redirect("/");
}

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
