import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { cn, dayKey, daysFromToday, one, todayKey } from "@/lib/format";
import { getLocale, translator } from "@/lib/i18n-server";
import { getSnapshot } from "@/server/snapshot";
import { createTask, openNotice, postMessage, setTaskStatus } from "@/server/actions/inbox";
import { AssignSelect } from "@/components/assign-select";
import { Banner, PageIntro, Tabs, Thumb, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Inbox") };
}

type Row = { key: string; title: string; body: string; href: string; at: Date | null; unread: boolean; noticeId?: string };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const tab = one(query.tab);
  const dateLocale = locale === "de" ? "de-DE" : "en-GB";
  const writable = can(session.role, "comments.write");

  const [snapshot, notices, messages, tasks, members] = await Promise.all([
    getSnapshot(session.organization.id),
    prisma.notification.findMany({ where: { organizationId: session.organization.id }, orderBy: { createdAt: "desc" }, take: 80 }),
    prisma.message.findMany({ where: { organizationId: session.organization.id }, include: { author: true }, orderBy: { createdAt: "asc" }, take: 200 }),
    prisma.task.findMany({ where: { organizationId: session.organization.id }, include: { assignee: true, createdBy: true }, orderBy: { createdAt: "desc" } }),
    prisma.membership.findMany({ where: { organizationId: session.organization.id }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
  ]);

  const covered = new Set(snapshot.problems.map((problem) => problem.href));
  const rows: Row[] = [
    ...snapshot.problems.map((problem) => ({
      key: `problem-${problem.kind}-${problem.title}`,
      title: problem.title,
      body: problem.meta,
      href: problem.href,
      at: null,
      unread: true,
    })),
    ...notices
      .filter((notice) => {
        if (notice.href && covered.has(notice.href)) return false;
        const tokens = `${notice.title} ${notice.body}`.match(/[A-Z0-9]+(?:-[A-Z0-9]+)+/g) ?? [];
        const live = snapshot.problems.map((problem) => `${problem.title} ${problem.meta}`).join(" ");
        return !tokens.some((token) => live.includes(token));
      })
      .map((notice) => ({
        key: notice.id,
        title: tx(notice.title),
        body: tx(notice.body),
        href: notice.href || "",
        at: notice.createdAt,
        unread: !notice.readAt,
        noticeId: notice.id,
      })),
  ];

  const today = todayKey();
  const yesterday = dayKey(daysFromToday(-1));
  const labelFor = (key: string) => {
    if (key === today) return tx("Today");
    if (key === yesterday) return tx("Yesterday");
    const [year, month, day] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(dateLocale, { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  };
  const clock = (date: Date) => new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(date);

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row.unread && row.noticeId) continue;
    const key = dayKey(row.at ?? new Date());
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const days = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const openTasks = tasks.filter((task) => task.status !== "done");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const people = members.map((member) => ({ id: member.user.id, name: member.user.name }));

  const messageDays: { key: string; items: typeof messages }[] = [];
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    const last = messageDays.at(-1);
    if (last && last.key === key) last.items.push(message);
    else messageDays.push({ key, items: [message] });
  }

  return (
    <div className="mx-auto max-w-[1040px]">
      <PageIntro title={tx("Inbox")} description={tx("What needs you, and what the team is working on.")} />
      <Banner notice={one(query.notice)} error={one(query.error)} />
      <Tabs
        items={[
          { href: "/inbox", label: tx("Notices"), active: tab !== "team", count: rows.filter((row) => row.unread).length },
          { href: "/inbox?tab=team", label: tx("Team"), active: tab === "team", count: openTasks.length },
        ]}
      />

      {tab !== "team" ? (
        days.length === 0 ? (
          <p className="px-1 py-10 text-[13px] text-muted">{tx("Nothing needs you right now.")}</p>
        ) : (
          <div className="space-y-6">
            {days.map(([key, items]) => (
              <section key={key}>
                <h2 className="mb-2 px-1 text-[12px] font-medium text-faint">{labelFor(key)}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow)]">
                  {items.map((item) => {
                    const inner = (
                      <>
                        <span className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", item.unread ? "bg-accent" : "bg-line-strong")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px]">{item.title}</span>
                          {item.body ? <span className="mt-0.5 block truncate text-[12px] text-faint">{item.body}</span> : null}
                        </span>
                        {item.at ? <span className="shrink-0 text-[12px] tabular-nums text-faint">{clock(item.at)}</span> : null}
                      </>
                    );
                    return (
                      <li key={item.key}>
                        {item.noticeId ? (
                          <form action={openNotice}>
                            <input type="hidden" name="id" value={item.noticeId} />
                            <button className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-ink/[0.025]">{inner}</button>
                          </form>
                        ) : (
                          <Link href={item.href} className="flex items-start gap-3 px-5 py-3.5 hover:bg-ink/[0.025]">{inner}</Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="rounded-2xl bg-surface shadow-[var(--shadow)]">
            <header className="px-5 pb-2 pt-4 text-[13px] font-medium">{tx("Messages")}</header>
            {messages.length === 0 ? <p className="px-5 pb-4 text-[13px] text-muted">{tx("No messages yet. Write the first one.")}</p> : null}
            <div className="max-h-[520px] space-y-5 overflow-y-auto px-5 py-3">
              {messageDays.map((group) => (
                <div key={group.key}>
                  <div className="mb-3 text-center text-[11px] font-medium text-faint">{labelFor(group.key)}</div>
                  <ul className="space-y-4">
                    {group.items.map((message) => {
                      const name = message.author?.name ?? tx("System");
                      return (
                        <li key={message.id} className="flex gap-3">
                          <Thumb label={name} size={28} className="rounded-full" />
                          <div className="min-w-0">
                            <div className="text-[13px]">
                              <span className="font-medium">{name}</span>
                              <span className="ml-2 text-[12px] text-faint">{clock(message.createdAt)}</span>
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-5 text-muted">{message.body}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            {writable ? (
              <form action={postMessage} className="flex items-center gap-2 border-t border-line p-3">
                <input name="body" required placeholder={tx("Write to the team")} className={fieldClass} />
                <SubmitButton pendingLabel="Sending">{tx("Send")}</SubmitButton>
              </form>
            ) : null}
          </section>

          <section className="rounded-2xl bg-surface shadow-[var(--shadow)]">
            <header className="px-5 pb-1 pt-4 text-[13px] font-medium">{tx("Tasks")}</header>
            {writable ? (
              <form action={createTask} className="space-y-2 border-b border-line px-5 py-3">
                <input name="title" required placeholder={tx("What needs doing?")} className={fieldClass} />
                <div className="flex items-center gap-2">
                  <select name="assigneeId" defaultValue="" aria-label={tx("Assign to")} className={cn(fieldClass, "max-w-[200px]")}>
                    <option value="">{tx("Unassigned")}</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                  </select>
                  <SubmitButton size="sm" pendingLabel="Saving">{tx("Add task")}</SubmitButton>
                </div>
              </form>
            ) : null}
            {tasks.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted">{tx("No tasks yet.")}</p> : null}
            <ul className="divide-y divide-line">
              {[...openTasks, ...doneTasks].map((task) => {
                const done = task.status === "done";
                return (
                  <li key={task.id} className="flex items-start gap-3 px-5 py-3">
                    {writable ? (
                      <form action={setTaskStatus}>
                        <input type="hidden" name="id" value={task.id} />
                        <input type="hidden" name="status" value={done ? "open" : "done"} />
                        <button type="submit" aria-label={tx(done ? "Reopen" : "Mark done")} className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border text-[10px] leading-none", done ? "border-ink bg-ink text-primary-ink" : "border-line-strong text-transparent hover:border-ink")}>
                          ✓
                        </button>
                      </form>
                    ) : (
                      <span className={cn("mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border", done ? "border-ink bg-ink" : "border-line-strong")} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-[13px]", done && "text-faint line-through")}>{task.title}</div>
                      {task.createdBy ? <div className="mt-0.5 text-[12px] text-faint">{tx("Added by {name}", { name: task.createdBy.name })}</div> : null}
                    </div>
                    {writable && !done ? (
                      <AssignSelect id={task.id} assigneeId={task.assigneeId ?? ""} people={people} />
                    ) : (
                      <span className="shrink-0 text-[12px] text-faint">{task.assignee?.name ?? tx("Unassigned")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
