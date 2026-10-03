"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function setPrefs(formData: FormData) {
  const jar = await cookies();
  const lang = String(formData.get("lang") || "");
  const theme = String(formData.get("theme") || "");
  const options = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };
  if (lang === "en" || lang === "de") jar.set("aera_lang", lang, options);
  if (theme === "light" || theme === "dark") jar.set("aera_theme", theme, options);
  revalidatePath("/", "layout");
}
