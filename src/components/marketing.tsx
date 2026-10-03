import Link from "next/link";
import { setPrefs } from "@/server/actions/prefs";
import type { Locale, Theme } from "@/lib/i18n";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-primary text-[12px] font-semibold text-primary-ink">A</span>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">Aera</span>
    </Link>
  );
}

export function PrefsSwitch({ locale, theme }: { locale: Locale; theme: Theme }) {
  const item = "rounded-md px-2 py-1 text-[12px] transition-colors";
  const on = "bg-ink/[0.06] text-ink";
  const off = "text-muted hover:text-ink";
  return (
    <div className="flex items-center gap-4">
      <form action={setPrefs} className="flex items-center gap-0.5">
        <button name="lang" value="en" className={`${item} ${locale === "en" ? on : off}`}>EN</button>
        <button name="lang" value="de" className={`${item} ${locale === "de" ? on : off}`}>DE</button>
      </form>
      <form action={setPrefs} className="flex items-center gap-0.5">
        <button name="theme" value="light" className={`${item} ${theme === "light" ? on : off}`}>Light</button>
        <button name="theme" value="dark" className={`${item} ${theme === "dark" ? on : off}`}>Dark</button>
      </form>
    </div>
  );
}
