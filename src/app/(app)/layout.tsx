import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getLocale, getTheme, translator } from "@/lib/i18n-server";
import { roleLabels, isRole } from "@/lib/permissions";
import { getSnapshot } from "@/server/snapshot";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";

function alreadyListed(title: string, body: string, href: string | null, live: string, hrefs: Set<string>) {
  if (href && hrefs.has(href)) return true;
  const tokens = `${title} ${body}`.match(/[A-Z0-9]+(?:-[A-Z0-9]+)+/g) ?? [];
  return tokens.some((token) => live.includes(token));
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireUser();
  const [tx, locale, theme, notices, snapshot, assistant] = await Promise.all([
    translator(),
    getLocale(),
    getTheme(),
    prisma.notification.findMany({
      where: { organizationId: session.organization.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    getSnapshot(session.organization.id),
    prisma.organization.findUnique({ where: { id: session.organization.id }, select: { aiKeyCipher: true } }),
  ]);
  const hrefs = new Set(snapshot.problems.map((problem) => problem.href));
  const live = snapshot.problems.map((problem) => `${problem.title} ${problem.meta}`).join(" ");
  const extra = notices.filter((notice) => !alreadyListed(notice.title, notice.body, notice.href, live, hrefs)).length;

  return (
    <AppShell
      orgName={session.organization.name}
      userName={session.user.name}
      roleLabel={isRole(session.role) ? tx(roleLabels[session.role]) : session.role}
      locale={locale}
      theme={theme}
      inboxCount={snapshot.problems.length + extra}
      assistantReady={Boolean(assistant?.aiKeyCipher)}
    >
      {children}
    </AppShell>
  );
}
