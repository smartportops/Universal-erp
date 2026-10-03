"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  ChevronsUpDown,
  CornerDownLeft,
  FileText,
  Home,
  ListChecks,
  LogOut,
  Menu,
  Package,
  PanelLeft,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Truck,
  Undo2,
  Users,
  Warehouse,
  X,
  Factory,
} from "lucide-react";
import { flatNavigation, navigation, secondaryNavigation, type NavIcon, type NavItem } from "@/lib/nav";
import { useTx } from "@/lib/i18n-client";
import type { Locale, Theme } from "@/lib/i18n";
import { setPrefs } from "@/server/actions/prefs";
import { askAssistant, searchAction } from "@/server/actions/assistant";
import { logout } from "@/server/actions/auth";
import type { AssistantAnswer } from "@/server/assistant";
import type { SearchHit } from "@/server/search";
import { cn } from "@/lib/format";

const icons: Record<NavIcon, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  dashboard: Home,
  products: Package,
  customers: Users,
  orders: ShoppingBag,
  suppliers: Factory,
  purchasing: Receipt,
  reorder: ListChecks,
  movements: ArrowLeftRight,
  warehouses: Warehouse,
  shipments: Truck,
  returns: Undo2,
  invoices: FileText,
  books: BookOpen,
  reports: BarChart3,
  documents: FileText,
  activities: Activity,
  settings: Settings,
  inbox: Bell,
};

const createActions = [
  { href: "/sales-orders/new", label: "New order", hint: "Sales" },
  { href: "/products/new", label: "New product", hint: "Catalog" },
  { href: "/customers/new", label: "New customer", hint: "Sales" },
  { href: "/purchase-orders/new", label: "New purchase order", hint: "Purchasing" },
  { href: "/stock/adjust", label: "Adjust stock", hint: "Warehouse" },
  { href: "/stock/transfer", label: "Transfer", hint: "Warehouse" },
];

function useModKey() {
  const [mod, setMod] = useState("\u2318");
  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setMod("Ctrl ");
  }, []);
  return mod;
}

export function AppShell({
  orgName,
  userName,
  roleLabel,
  locale,
  theme,
  inboxCount,
  children,
}: {
  orgName: string;
  userName: string;
  roleLabel: string;
  locale: Locale;
  theme: Theme;
  inboxCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tx = useTx();
  const mod = useModKey();
  const [navOpen, setNavOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [menu, setMenu] = useState(false);
  const [account, setAccount] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [wide, setWide] = useState(true);
  const rail = collapsed && wide;

  useEffect(() => {
    setCollapsed(localStorage.getItem("aera_nav") === "collapsed");
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  function toggleNav() {
    setCollapsed((value) => {
      localStorage.setItem("aera_nav", value ? "open" : "collapsed");
      return !value;
    });
  }

  async function choose(nextLocale?: Locale, nextTheme?: Theme) {
    const lang = nextLocale ?? locale;
    const appearance = nextTheme ?? theme;
    document.documentElement.classList.toggle("dark", appearance === "dark");
    document.documentElement.lang = lang === "de" ? "de" : "en";
    const data = new FormData();
    data.set("lang", lang);
    data.set("theme", appearance);
    await setPrefs(data);
    setAccount(false);
    router.refresh();
  }

  useEffect(() => {
    setNavOpen(false);
    setPalette(false);
    setMenu(false);
    setAccount(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      }
      if (meta && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleNav();
      }
      if (meta && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setAssistant((open) => !open);
        setPalette(false);
      }
      if (event.key === "Escape") {
        setPalette(false);
        setAssistant(false);
            setMenu(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="min-h-screen bg-bg text-ink">
      {navOpen ? <button className="fixed inset-0 z-30 bg-ink/20 md:hidden" aria-label={tx("Close menu")} onClick={() => setNavOpen(false)} /> : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[228px] flex-col border-r border-line bg-bg px-2.5 pb-3 pt-3 transition-[width,transform] duration-200 ease-out",
          navOpen ? "translate-x-0 shadow-[var(--shadow-lg)]" : "-translate-x-full md:translate-x-0",
          rail && "md:w-16 md:px-2",
        )}
      >
        <div className={cn("relative flex items-center", rail ? "flex-col gap-1" : "gap-1")}>
          <button className={cn("flex min-w-0 items-center rounded-lg text-left hover:bg-ink/[0.04]", rail ? "h-8 w-8 justify-center" : "flex-1 gap-2.5 px-2 py-1.5")} onClick={() => setMenu((open) => !open)} title={rail ? orgName : undefined}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold text-primary-ink">{orgName[0]}</span>
            {rail ? null : <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{orgName}</span>}
          </button>
          <button
            type="button"
            className={cn("shrink-0 place-items-center rounded-lg text-faint hover:bg-ink/[0.04] hover:text-ink", rail ? "grid h-8 w-8 md:grid" : "hidden h-7 w-7 md:grid")}
            onClick={toggleNav}
            aria-label={tx(rail ? "Expand sidebar" : "Collapse sidebar")}
            title={`${tx(rail ? "Expand sidebar" : "Collapse sidebar")} (${mod}B)`}
          >
            <PanelLeft size={15} />
          </button>
          {menu ? (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label={tx("Close")} onClick={() => setMenu(false)} />
              <div className={cn("absolute z-50 w-[220px] rounded-xl bg-surface p-1 shadow-[var(--shadow-lg)]", rail ? "left-full top-0 ml-2" : "left-0 right-0 top-10")}>
                <div className="px-2.5 py-2 text-[11px] font-medium text-faint">{tx("Workspace")}</div>
                <Link href="/settings" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-subtle">
                  <Settings size={14} /> {tx("Settings")}
                </Link>
                <Link href="/settings?section=users" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-subtle">
                  <Users size={14} /> {tx("Team")}
                </Link>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-2 space-y-0.5">
          {rail ? (
            <RailButton icon={Search} label={`${tx("Search")}  ${mod}K`} onClick={() => setPalette(true)} />
          ) : (
            <button
              className="flex h-8 w-full items-center gap-2 rounded-lg bg-surface px-2.5 text-left text-[13px] text-muted shadow-[var(--shadow)] hover:text-ink"
              onClick={() => setPalette(true)}
            >
              <Search size={14} />
              <span className="flex-1">{tx("Search")}</span>
              <kbd>{mod}K</kbd>
            </button>
          )}
          <div className="pt-1.5" />
          <SideButton icon={Sparkles} label={tx("Assistant")} shortcut={`${mod}J`} compact={rail} onClick={() => setAssistant(true)} />
          <SideButton icon={Bell} label={tx("Inbox")} count={inboxCount} compact={rail} href="/inbox" active={pathname === "/inbox"} />
        </div>

        <nav className={cn("mt-4 flex-1 overflow-y-auto", rail ? "space-y-3" : "space-y-4")}>
          {navigation.map((group, index) => (
            <div key={group.label ?? index}>
              {group.label && !rail ? <div className="px-2.5 pb-1 text-[11px] font-medium text-faint">{tx(group.label)}</div> : null}
              {group.label && rail && index > 0 ? <div className="mx-auto mb-2 h-px w-4 bg-line" /> : null}
              <div className="space-y-px">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} compact={rail} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="relative space-y-px pt-2">
          {secondaryNavigation.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} compact={rail} />
          ))}
          <div className="relative mt-2">
          <button type="button" aria-expanded={account} title={rail ? userName : undefined} className={cn("flex items-center rounded-lg text-left hover:bg-ink/[0.04]", rail ? "mx-auto h-8 w-8 justify-center" : "w-full gap-2 px-2.5 py-1.5", account && "bg-ink/[0.04]")} onClick={() => setAccount((open) => !open)}>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-soft text-[10px] font-semibold text-accent">{initials}</span>
            {rail ? null : <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{userName}</span>}
            {rail ? null : <ChevronsUpDown size={13} className="shrink-0 text-faint" />}
          </button>
          {account ? (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label={tx("Close")} onClick={() => setAccount(false)} />
              <div className={cn("absolute z-50 origin-bottom rounded-xl bg-surface p-2 shadow-[var(--shadow-lg)]", rail ? "bottom-0 left-full mb-0 ml-2 w-[228px]" : "bottom-full left-0 right-0 mb-1.5")}>
                <div className="px-2 py-1.5">
                  <div className="truncate text-[13px] font-medium">{userName}</div>
                  <div className="text-[12px] text-muted">{roleLabel}</div>
                </div>
                <div className="px-2 pt-2 text-[11px] font-medium text-faint">{tx("Language")}</div>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <PrefButton active={locale === "en"} onClick={() => void choose("en")}>English</PrefButton>
                  <PrefButton active={locale === "de"} onClick={() => void choose("de")}>Deutsch</PrefButton>
                </div>
                <div className="px-2 pt-3 text-[11px] font-medium text-faint">{tx("Appearance")}</div>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <PrefButton active={theme === "light"} onClick={() => void choose(undefined, "light")}>{tx("Light")}</PrefButton>
                  <PrefButton active={theme === "dark"} onClick={() => void choose(undefined, "dark")}>{tx("Dark")}</PrefButton>
                </div>
                <div className="mt-2 border-t border-line pt-1">
                  <form action={logout}>
                    <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted hover:bg-subtle hover:text-ink">
                      <LogOut size={14} /> {tx("Sign out")}
                    </button>
                  </form>
                </div>
              </div>
            </>
          ) : null}
          </div>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-200 ease-out", rail ? "md:pl-16" : "md:pl-[228px]")}>
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 bg-bg/90 px-4 backdrop-blur md:hidden">
          <button className="grid h-8 w-8 place-items-center rounded-lg text-muted" onClick={() => setNavOpen(true)} aria-label={tx("Menu")}>
            <Menu size={16} />
          </button>
          <span className="text-[13px] font-semibold">{orgName}</span>
          <button className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted" onClick={() => setPalette(true)} aria-label={tx("Search")}>
            <Search size={16} />
          </button>
        </header>
        <main className="px-4 pb-16 pt-6 md:px-10 md:pt-9">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>
      {palette ? (
        <CommandPalette
          onClose={() => setPalette(false)}
          onAssistant={() => {
            setPalette(false);
            setAssistant(true);
          }}
        />
      ) : null}
      {assistant ? <AssistantPanel onClose={() => setAssistant(false)} /> : null}
    </div>
  );
}


function PrefButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("h-8 rounded-lg text-[13px]", active ? "bg-primary font-medium text-primary-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink")}>
      {children}
    </button>
  );
}

function NavLink({ item, pathname, compact = false }: { item: NavItem; pathname: string; compact?: boolean }) {
  const tx = useTx();
  const Icon = icons[item.icon];
  const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      title={compact ? tx(item.label) : undefined}
      className={cn(
        "flex h-8 items-center rounded-lg text-[13px] transition-colors",
        compact ? "justify-center" : "gap-2.5 px-2.5",
        active ? "bg-surface font-medium text-ink shadow-[var(--shadow)]" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
      )}
    >
      <Icon size={15} strokeWidth={1.8} className={active ? "text-ink" : "text-faint"} />
      {compact ? null : tx(item.label)}
    </Link>
  );
}

function SideButton({
  icon: Icon,
  label,
  shortcut,
  count,
  compact = false,
  href,
  active = false,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  shortcut?: string;
  count?: number;
  compact?: boolean;
  href?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "relative flex h-8 items-center rounded-lg text-[13px] hover:bg-ink/[0.04] hover:text-ink",
    active ? "bg-surface font-medium text-ink shadow-[var(--shadow)]" : "text-muted",
    compact ? "mx-auto w-8 justify-center" : "w-full gap-2.5 px-2.5 text-left",
  );
  const content = (
    <>
      <Icon size={15} strokeWidth={1.8} className={active ? "text-ink" : "text-faint"} />
      {compact ? null : <span className="flex-1">{label}</span>}
      {!compact && shortcut ? <kbd>{shortcut}</kbd> : null}
      {!compact && count ? <span className="rounded-full bg-danger px-1.5 text-[11px] font-medium leading-[18px] text-white">{count}</span> : null}
      {compact && count ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" /> : null}
    </>
  );
  if (href) return <Link href={href} title={compact ? label : undefined} className={className}>{content}</Link>;
  return <button type="button" onClick={onClick} title={compact ? label : undefined} className={className}>{content}</button>;
}

function RailButton({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} className="mx-auto grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-ink/[0.04] hover:text-ink">
      <Icon size={15} strokeWidth={1.8} />
    </button>
  );
}

type PaletteItem = { id: string; group: string; label: string; hint?: string; href: string; kind: "nav" | "create" | "hit" };

function CommandPalette({ onClose, onAssistant }: { onClose: () => void; onAssistant: () => void }) {
  const tx = useTx();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const results = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const nav = flatNavigation
      .filter((item) => !q || item.label.toLowerCase().includes(q))
      .map((item) => ({ id: item.href, group: tx("Jump to"), label: tx(item.label), href: item.href, kind: "nav" as const }));
    const create = createActions
      .filter((item) => !q || item.label.toLowerCase().includes(q))
      .map((item) => ({ id: item.href, group: tx("Create"), label: tx(item.label), hint: tx(item.hint), href: item.href, kind: "create" as const }));
    if (q.length < 2) return [...create.slice(0, 4), ...nav];
    const found = hits.map((hit) => ({ id: hit.id, group: hit.group, label: hit.label, hint: hit.hint, href: hit.href, kind: "hit" as const }));
    return [...found, ...create.slice(0, 2), ...nav.slice(0, 3)];
  }, [query, hits]);

  useEffect(() => {
    setIndex(0);
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const handle = setTimeout(() => {
      void searchAction(query).then(setHits);
    }, 120);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function open(item: PaletteItem | undefined) {
    if (!item) return;
    router.push(item.href);
    onClose();
  }

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 bg-[#111114]/20 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="mx-auto mt-[12vh] w-full max-w-[600px] overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-lg)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tx("Order, SKU, EAN, customer, tracking or a command")}
            className="h-[52px] w-full bg-transparent text-[15px] outline-none placeholder:text-faint"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((current) => Math.min(current + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((current) => Math.max(current - 1, 0));
              }
              if (event.key === "Enter") open(results[index]);
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div ref={list} className="max-h-[380px] overflow-y-auto p-1.5">
          {results.length === 0 ? <p className="px-3 py-8 text-center text-[13px] text-muted">{tx("No results for “{query}”.", { query })}</p> : null}
          {results.map((item, itemIndex) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={`${item.group}-${item.id}-${itemIndex}`}>
                {header ? <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium text-faint">{header}</div> : null}
                <button
                  data-index={itemIndex}
                  className={cn("flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]", itemIndex === index && "bg-subtle")}
                  onMouseMove={() => setIndex(itemIndex)}
                  onClick={() => open(item)}
                >
                  <span className="grid h-5 w-5 place-items-center text-faint">
                    {item.kind === "create" ? <Plus size={14} /> : item.kind === "nav" ? <ArrowUpRight size={14} /> : <ArrowLeftRight size={13} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{item.label}</span>
                    {item.hint ? <span className="ml-2 text-muted">{item.hint}</span> : null}
                  </span>
                  {itemIndex === index ? <CornerDownLeft size={13} className="text-faint" /> : null}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-line bg-subtle px-4 py-2 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <kbd>{"\u2191"}</kbd>
            <kbd>{"\u2193"}</kbd> {tx("choose")} <kbd className="ml-2">{"\u21b5"}</kbd> {tx("open")}
          </span>
          <button className="flex items-center gap-1.5 font-medium text-accent" onClick={onAssistant}>
            <Sparkles size={13} /> {tx("Ask the assistant")}
          </button>
        </div>
      </div>
    </div>
  );
}

const prompts = [
  "Show me late orders.",
  "Why is this item's stock negative?",
  "Which products do we need to reorder?",
  "Summarize today's problems.",
];

function AssistantPanel({ onClose }: { onClose: () => void }) {
  const tx = useTx();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string; answer?: AssistantAnswer }[]>([]);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setPending(true);
    try {
      const answer = await askAssistant(message);
      setMessages((current) => [...current, { role: "assistant", text: answer.body, answer }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="fixed inset-y-2 right-2 z-40 flex w-[calc(100%-1rem)] max-w-[420px] flex-col overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-lg)]">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-soft text-accent">
            <Sparkles size={14} />
          </span>
          <div>
            <div className="text-[13px] font-semibold">{tx("Assistant")}</div>
            <div className="text-[12px] text-muted">{tx("Knows orders, stock and documents")}</div>
          </div>
        </div>
        <button onClick={onClose} aria-label={tx("Close")} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-ink/[0.04]">
          <X size={16} />
        </button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-2">
        {messages.length === 0 ? (
          <div className="space-y-1.5 pt-2">
            <p className="pb-2 text-[13px] leading-5 text-muted">{tx("Ask what matters operationally today. Answers come straight from orders, movements and invoices.")}</p>
            {prompts.map((prompt) => (
              <button key={tx(prompt)} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] ring-1 ring-line hover:bg-subtle" onClick={() => void send(prompt)}>
                {tx(prompt)}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((message, messageIndex) =>
          message.role === "user" ? (
            <div key={messageIndex} className="ml-10 rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13px] text-primary-ink">
              {message.text}
            </div>
          ) : (
            <div key={messageIndex} className="text-[13px] leading-6">
              {message.answer ? <div className="mb-1 font-semibold">{message.answer.title}</div> : null}
              <div className="whitespace-pre-wrap text-ink">{message.text}</div>
              {message.answer?.links.length ? (
                <div className="mt-2.5 overflow-hidden rounded-xl ring-1 ring-line">
                  {message.answer.links.map((link) => (
                    <Link key={link.href + link.label} href={link.href} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-0 hover:bg-subtle" onClick={onClose}>
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{link.label}</span>
                        {link.meta ? <span className="ml-2 text-muted">{link.meta}</span> : null}
                      </span>
                      <ArrowUpRight size={13} className="shrink-0 text-faint" />
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ),
        )}
        {pending ? <p className="text-[13px] text-muted">{tx("Looking…")}</p> : null}
        <div ref={end} />
      </div>
      <form
        className="p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-center gap-2 rounded-xl px-3 ring-1 ring-line-strong focus-within:ring-2 focus-within:ring-accent/40">
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={tx("Ask a question")} className="h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-faint" />
          <button type="submit" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-ink disabled:opacity-40" disabled={!input.trim() || pending} aria-label={tx("Send")}>
            <CornerDownLeft size={13} />
          </button>
        </div>
      </form>
    </aside>
  );
}
