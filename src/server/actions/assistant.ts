"use server";

import { requireUser } from "@/lib/auth";
import { answerQuestion } from "@/server/assistant";
import { searchRecords } from "@/server/search";

async function attachmentFrom(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > 8 * 1024 * 1024) throw new Error("File is larger than 8 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const name = file.name || "upload";
  if (file.type.startsWith("image/")) return { name, image: { mime: file.type, base64: bytes.toString("base64") } };
  if (file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const extracted = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : String(extracted.text ?? "");
    return { name, text };
  }
  return { name, text: bytes.toString("utf8") };
}

export async function askAssistant(formData: FormData) {
  const session = await requireUser();
  const message = String(formData.get("message") || "").trim();
  const attachment = await attachmentFrom(formData.get("file"));
  if (!message && !attachment) throw new Error("Write a question or attach a file.");
  return answerQuestion(session.organization.id, message || "Read the attached file and do what it asks.", {
    actorId: session.user.id,
    role: session.role,
    attachment,
  });
}

export async function searchAction(query: string) {
  const session = await requireUser();
  return searchRecords(session.organization.id, query);
}
