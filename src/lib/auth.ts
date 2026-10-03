import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, type Permission } from "@/lib/permissions";

const SESSION_COOKIE = "aera_session";
const CHALLENGE_COOKIE = "aera_challenge";
const secret = process.env.AUTH_SECRET ?? "aera-local-beta-secret";

export type SessionContext = {
  user: { id: string; email: string; name: string; totpEnabled: boolean };
  organization: {
    id: string;
    name: string;
    legalName: string;
    slug: string;
    currency: string;
  };
  role: string;
  sessionId: string;
};

function sign(value: string) {
  const mac = createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${mac}`;
}

function unsign(signed: string) {
  const index = signed.lastIndexOf(".");
  if (index === -1) return null;
  const value = signed.slice(0, index);
  const mac = signed.slice(index + 1);
  const expected = createHmac("sha256", secret).update(value).digest("hex");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return value;
}

export async function getSession(): Promise<SessionContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: true,
      organization: true,
      membership: true,
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return {
    sessionId: session.id,
    role: session.membership.role,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      totpEnabled: session.user.totpEnabled,
    },
    organization: {
      id: session.organization.id,
      name: session.organization.name,
      legalName: session.organization.legalName,
      slug: session.organization.slug,
      currency: session.organization.currency,
    },
  };
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requirePermission(permission: Permission) {
  const session = await requireUser();
  if (!can(session.role, permission)) {
    throw new Error("Keine Berechtigung für diese Aktion.");
  }
  return session;
}

export async function createSession(userId: string, membershipId: string, organizationId: string) {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      token,
      userId,
      membershipId,
      organizationId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  jar.delete(SESSION_COOKIE);
}

export async function setChallenge(userId: string) {
  const expires = Date.now() + 5 * 60 * 1000;
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, sign(`${userId}:${expires}`), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 5,
  });
}

export async function readChallenge() {
  const jar = await cookies();
  const raw = jar.get(CHALLENGE_COOKIE)?.value;
  if (!raw) return null;
  const value = unsign(raw);
  if (!value) return null;
  const [userId, expires] = value.split(":");
  if (!userId || Number(expires) < Date.now()) return null;
  return userId;
}

export async function clearChallenge() {
  const jar = await cookies();
  jar.delete(CHALLENGE_COOKIE);
}
