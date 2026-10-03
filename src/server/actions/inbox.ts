"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { refresh, runAction } from "@/server/action";

async function member(organizationId: string, userId: string) {
  if (!userId) return null;
  return prisma.membership.findFirst({ where: { organizationId, userId } });
}

export async function openNotice(formData: FormData) {
  await runAction("/inbox", async () => {
    const session = await requireUser();
    const id = String(formData.get("id") || "");
    const notice = await prisma.notification.findFirst({ where: { id, organizationId: session.organization.id } });
    if (!notice) return;
    if (!notice.readAt) await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    refresh();
    redirect(notice.href || "/inbox");
  });
}

export async function postMessage(formData: FormData) {
  await runAction("/inbox?tab=team", async () => {
    const session = await requirePermission("comments.write");
    const body = String(formData.get("body") || "").trim();
    if (!body) throw new Error("Write something first.");
    await prisma.message.create({
      data: { organizationId: session.organization.id, authorId: session.user.id, body: body.slice(0, 2000) },
    });
    refresh();
    redirect("/inbox?tab=team&notice=" + encodeURIComponent("Message sent."));
  });
}

export async function createTask(formData: FormData) {
  await runAction("/inbox?tab=team", async () => {
    const session = await requirePermission("comments.write");
    const title = String(formData.get("title") || "").trim();
    if (!title) throw new Error("A title is required.");
    const assigneeId = String(formData.get("assigneeId") || "");
    if (assigneeId && !(await member(session.organization.id, assigneeId))) throw new Error("This person is not on the team.");
    await prisma.task.create({
      data: {
        organizationId: session.organization.id,
        title: title.slice(0, 160),
        assigneeId: assigneeId || null,
        createdById: session.user.id,
      },
    });
    refresh();
    redirect("/inbox?tab=team&notice=" + encodeURIComponent("Task added."));
  });
}

export async function setTaskStatus(formData: FormData) {
  await runAction("/inbox?tab=team", async () => {
    const session = await requirePermission("comments.write");
    const id = String(formData.get("id") || "");
    const status = String(formData.get("status") || "") === "done" ? "done" : "open";
    const task = await prisma.task.findFirst({ where: { id, organizationId: session.organization.id } });
    if (!task) return;
    await prisma.task.update({ where: { id }, data: { status } });
    refresh();
    redirect("/inbox?tab=team");
  });
}

export async function assignTask(formData: FormData) {
  await runAction("/inbox?tab=team", async () => {
    const session = await requirePermission("comments.write");
    const id = String(formData.get("id") || "");
    const assigneeId = String(formData.get("assigneeId") || "");
    const task = await prisma.task.findFirst({ where: { id, organizationId: session.organization.id } });
    if (!task) return;
    if (assigneeId && !(await member(session.organization.id, assigneeId))) throw new Error("This person is not on the team.");
    await prisma.task.update({ where: { id }, data: { assigneeId: assigneeId || null } });
    refresh();
    redirect("/inbox?tab=team");
  });
}
