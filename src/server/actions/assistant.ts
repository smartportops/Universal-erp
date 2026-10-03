"use server";

import { requireUser } from "@/lib/auth";
import { answerQuestion } from "@/server/assistant";
import { searchRecords } from "@/server/search";

export async function askAssistant(message: string) {
  const session = await requireUser();
  return answerQuestion(session.organization.id, message);
}

export async function searchAction(query: string) {
  const session = await requireUser();
  return searchRecords(session.organization.id, query);
}
