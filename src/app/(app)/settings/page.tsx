import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, grantsFor, permissionLabels, permissions, roleLabels, roles } from "@/lib/permissions";
import { cn, formatDay, formatWhen, one } from "@/lib/format";
import { documentKinds } from "@/lib/labels";
import { entityHref } from "@/lib/nav";
import { saveAssistant } from "@/server/actions/assistant-settings";
import {
  addCustomField,
  addTax,
  confirmTotpSetup,
  createWebhook,
  disableTotp,
  importProducts,
  inviteUser,
  startTotp,
} from "@/server/actions/platform";
import { ApiKeyForm } from "@/components/api-key-form";
import { InlineEdit } from "@/components/inline-edit";
import { Banner, EmptyState, Field, PageIntro, Panel, Pill, Properties, Tabs, Thumb, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getLocale, translator } from "@/lib/i18n-server";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Settings") };
}

const sections: { group: string; items: [string, string][] }[] = [
  { group: "Company", items: [["company", "General"], ["users", "Team"], ["roles", "Roles"]] },
  { group: "Business operations", items: [["taxes", "Taxes"], ["sequences", "Number sequences"], ["fields", "Custom fields"]] },
  { group: "Data", items: [["integrations", "Integrations"], ["webhooks", "Webhooks"], ["api", "API"], ["assistant", "Assistant"], ["import", "Import"]] },
  { group: "History", items: [["documents", "Documents"], ["activities", "Activities"]] },
  { group: "Account", items: [["security", "Security"]] },
];

const sequenceLabels: Record<string, string> = {
  sales_order: "Orders",
  purchase_order: "Purchase orders",
  shipment: "Shipments",
  invoice: "Invoices",
  invoice_cancellation: "Cancellation invoices",
  credit: "Credit notes",
  credit_cancellation: "Credit note cancellations",
  quote: "Quotes",
  return: "Returns",
  journal: "Journal entries",
};

const entityLabels: Record<string, string> = { product: "Product", customer: "Customer", sales_order: "Sales order", supplier: "Supplier" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireUser();
  const query = await searchParams;
  const [tx, locale] = await Promise.all([translator(), getLocale()]);
  const section = one(query.section) || "company";
  const tab = one(query.tab);
  const orgId = session.organization.id;
  const [org, memberships, taxes, sequences, integrations, hooks, keys, fields, user, documents, activities, audits] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
    prisma.membership.findMany({ where: { organizationId: orgId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    prisma.taxRate.findMany({ where: { organizationId: orgId } }),
    prisma.numberSequence.findMany({ where: { organizationId: orgId }, orderBy: { key: "asc" } }),
    prisma.integration.findMany({ where: { organizationId: orgId }, orderBy: { provider: "asc" } }),
    prisma.webhookEndpoint.findMany({ where: { organizationId: orgId }, include: { deliveries: { take: 5, orderBy: { createdAt: "desc" } } } }),
    prisma.apiKey.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } }),
    prisma.customFieldDefinition.findMany({ where: { organizationId: orgId } }),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    section === "documents"
      ? prisma.document.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 80 })
      : Promise.resolve([]),
    section === "activities" && tab !== "audit"
      ? prisma.activity.findMany({ where: { organizationId: orgId }, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 80 })
      : Promise.resolve([]),
    section === "activities" && tab === "audit"
      ? prisma.auditLog.findMany({ where: { organizationId: orgId }, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 100 })
      : Promise.resolve([]),
  ]);
  const admin = can(session.role, "settings.write");
  const title = sections.flatMap((group) => group.items).find(([key]) => key === section)?.[1] ?? "Settings";
  const orgEdit = (field: string, value: string | null) => <InlineEdit entity="organization" id={org.id} field={field} value={value ?? ""} disabled={!admin} placeholder={tx("Add")} />;
  const roleOptions = roles.map((role) => ({ value: role, label: tx(roleLabels[role]) }));

  return (
    <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-9 lg:self-start">
        {sections.map((group) => (
          <div key={group.group}>
            <div className="px-2.5 pb-1 text-[11px] font-medium text-faint">{tx(group.group)}</div>
            {group.items.map(([key, label]) => (
              <Link
                key={key}
                href={`/settings?section=${key}`}
                className={cn("block rounded-lg px-2.5 py-1.5 text-[13px]", section === key ? "bg-surface font-medium shadow-[var(--shadow)]" : "text-muted hover:bg-black/[0.04] hover:text-ink")}
              >
                {tx(label)}
              </Link>
            ))}
          </div>
        ))}
      </aside>
      <div className="min-w-0 max-w-3xl">
        <PageIntro title={tx(title)} description={section === "documents" ? tx("Documents attach automatically to the order, purchase order and shipment.") : section === "activities" ? tx("The timeline is for the team. The audit is the unchanged trail of the same events.") : undefined} />
        <Banner error={one(query.error) ? tx(one(query.error)) : undefined} notice={one(query.notice) ? tx(one(query.notice)) : undefined} />

        {section === "company" ? (
          <Panel title={tx("Company")} description={admin ? tx("Click a value to change it.") : undefined}>
            <Properties
              items={[
                { label: tx("Name"), value: orgEdit("name", org.name) },
                { label: tx("Legal name"), value: orgEdit("legalName", org.legalName) },
                { label: tx("Email"), value: orgEdit("email", org.email) },
                { label: tx("Phone"), value: orgEdit("phone", org.phone) },
                { label: tx("VAT ID"), value: orgEdit("vatId", org.vatId) },
                { label: tx("Tax number"), value: orgEdit("taxNumber", org.taxNumber) },
                { label: tx("Street"), value: orgEdit("street", org.street) },
                { label: tx("Postal code"), value: orgEdit("postalCode", org.postalCode) },
                { label: tx("City"), value: orgEdit("city", org.city) },
                { label: tx("Account holder"), value: orgEdit("accountHolder", org.accountHolder) },
                { label: tx("IBAN"), value: orgEdit("iban", org.iban) },
                { label: tx("BIC"), value: orgEdit("bic", org.bic) },
                { label: tx("Bank"), value: orgEdit("bankName", org.bankName) },
                { label: tx("Currency"), value: org.currency },
              ]}
            />
          </Panel>
        ) : null}

        {section === "users" ? (
          <div className="space-y-5">
            <Panel title={tx("Team")} flush>
              <ul>
                {memberships.map((membership) => (
                  <li key={membership.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5">
                    <Thumb label={membership.user.name} size={30} className="rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{membership.user.name}{membership.userId === session.user.id ? <span className="ml-1.5 font-normal text-muted">{tx("(you)")}</span> : null}</span>
                      <span className="block truncate text-[12px] text-muted">{membership.user.email}</span>
                    </span>
                    <span className="w-44">
                      <InlineEdit entity="membership" id={membership.id} field="role" type="select" value={membership.role} options={roleOptions} disabled={!admin || membership.userId === session.user.id} />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
            {admin ? (
              <Panel title={tx("Invite someone")}>
                <form action={inviteUser} className="grid gap-3 sm:grid-cols-2">
                  <Field label={tx("Name")}><input name="name" required className={fieldClass} /></Field>
                  <Field label={tx("Email")}><input name="email" type="email" required className={fieldClass} /></Field>
                  <Field label={tx("Initial password")} hint={tx("At least 8 characters")}><input name="password" type="text" required minLength={8} className={fieldClass} /></Field>
                  <Field label={tx("Role")}><select name="role" defaultValue="operations" className={fieldClass}>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></Field>
                  <div className="sm:col-span-2 flex justify-end"><SubmitButton>{tx("Add")}</SubmitButton></div>
                </form>
              </Panel>
            ) : null}
          </div>
        ) : null}

        {section === "roles" ? (
          <Panel title={tx("Permissions by role")} description={tx("Everyone can read. Writing is separated by role.")} flush>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-y border-line bg-subtle text-left text-[12px] text-muted">
                    <th className="py-2 pl-5 pr-3 font-medium">{tx("Permission")}</th>
                    {roles.map((role) => <th key={role} className="px-2 py-2 text-center font-medium">{tx(roleLabels[role])}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((permission) => (
                    <tr key={permission} className="border-b border-line last:border-0">
                      <td className="py-2.5 pl-5 pr-3">{tx(permissionLabels[permission])}</td>
                      {roles.map((role) => (
                        <td key={role} className="px-2 py-2.5 text-center">
                          {grantsFor(role).includes(permission) ? <span className="inline-block h-2 w-2 rounded-full bg-ok" /> : <span className="inline-block h-2 w-2 rounded-full bg-[#ececf0]" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}

        {section === "taxes" ? (
          <Panel title={tx("Tax rates")} flush>
            <ul>
              {taxes.map((tax) => (
                <li key={tax.id} className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px]">
                  <span className="flex items-center gap-2">{tax.name}{tax.isDefault ? <Pill tone="info">{tx("Default")}</Pill> : null}</span>
                  <span className="font-medium tabular-nums">{(tax.rateBps / 100).toLocaleString(locale === "de" ? "de-DE" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</span>
                </li>
              ))}
            </ul>
            {admin ? (
              <form action={addTax} className="grid grid-cols-[1fr_100px_auto] items-center gap-2 border-t border-line bg-subtle px-5 py-3">
                <input name="name" required placeholder={tx("New rate, e.g. reduced")} className={fieldClass} />
                <input name="percent" required placeholder="%" className={`${fieldClass} text-right`} />
                <SubmitButton variant="secondary" size="sm">{tx("Add")}</SubmitButton>
              </form>
            ) : null}
          </Panel>
        ) : null}

        {section === "sequences" ? (
          <Panel title={tx("Number sequences")} description={tx("Prefix and next number can be changed directly.")} flush>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-line bg-subtle text-left text-[12px] text-muted">
                  <th className="py-2 pl-5 pr-3 font-medium">{tx("Record")}</th>
                  <th className="px-3 py-2 font-medium">{tx("Prefix")}</th>
                  <th className="px-3 py-2 font-medium">{tx("Next number")}</th>
                  <th className="py-2 pl-3 pr-5 font-medium">{tx("Preview")}</th>
                </tr>
              </thead>
              <tbody>
                {sequences.map((sequence) => (
                  <tr key={sequence.id} className="border-b border-line last:border-0">
                    <td className="py-2 pl-5 pr-3">{tx(sequenceLabels[sequence.key] ?? sequence.key)}</td>
                    <td className="w-32 px-3 py-2"><InlineEdit entity="sequence" id={sequence.id} field="prefix" value={sequence.prefix} disabled={!admin} mono /></td>
                    <td className="w-40 px-3 py-2"><InlineEdit entity="sequence" id={sequence.id} field="nextNumber" type="number" value={String(sequence.nextNumber)} disabled={!admin} mono /></td>
                    <td className="py-2 pl-3 pr-5 font-mono text-[12px] text-muted">{sequence.prefix}{String(sequence.nextNumber).padStart(sequence.padding, "0")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ) : null}

        {section === "fields" ? (
          <Panel title={tx("Custom fields")} description={tx("They appear on the detail page and can be edited there.")} flush>
            <ul>
              {fields.map((field) => (
                <li key={field.id} className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px]">
                  <span className="font-medium">{field.label}</span>
                  <Pill>{tx(entityLabels[field.entityType] ?? field.entityType)}</Pill>
                </li>
              ))}
            </ul>
            {admin ? (
              <form action={addCustomField} className="grid grid-cols-[150px_1fr_auto] items-center gap-2 border-t border-line bg-subtle px-5 py-3">
                <select name="entityType" className={fieldClass}>
                  {Object.entries(entityLabels).filter(([key]) => key !== "supplier").map(([key, label]) => <option key={key} value={key}>{tx(label)}</option>)}
                </select>
                <input name="label" required placeholder={tx("Field name, e.g. material")} className={fieldClass} />
                <SubmitButton variant="secondary" size="sm">{tx("Add")}</SubmitButton>
              </form>
            ) : null}
          </Panel>
        ) : null}

        {section === "integrations" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {integrations.map((integration) => (
              <div key={integration.id} className="rounded-xl bg-surface p-4 shadow-[var(--shadow)]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <Thumb label={integration.provider} size={30} />
                    <span className="text-[13px] font-semibold capitalize">{integration.provider}</span>
                  </span>
                  <Pill>{tx("Coming soon")}</Pill>
                </div>
                <p className="mt-3 text-[13px] text-muted">{integration.note || tx("Not connected yet.")}</p>
              </div>
            ))}
          </div>
        ) : null}

        {section === "webhooks" ? (
          <div className="space-y-5">
            {hooks.map((hook) => (
              <Panel key={hook.id} title={<span className="font-mono text-[13px]">{hook.url}</span>}>
                <div className="flex flex-wrap gap-1.5">
                  {(JSON.parse(hook.events) as string[]).map((event) => <Pill key={event}>{event}</Pill>)}
                </div>
                <p className="mt-3 text-[12px] text-muted">{tx("{n} deliveries are queued. Nothing is sent outside during the beta.", { n: hook.deliveries.length })}</p>
              </Panel>
            ))}
            {admin ? (
              <Panel title={tx("Add endpoint")}>
                <form action={createWebhook} className="space-y-3">
                  <Field label="URL"><input name="url" required placeholder="https://" className={fieldClass} /></Field>
                  <Field label={tx("Events")} hint={tx("Comma-separated, * for all")}><input name="events" placeholder="sales_order.shipped, stock.negative" className={fieldClass} /></Field>
                  <div className="flex justify-end"><SubmitButton>{tx("Add")}</SubmitButton></div>
                </form>
              </Panel>
            ) : null}
          </div>
        ) : null}

        {section === "assistant" ? (
          <Panel title={tx("Assistant")} description={tx("One provider is used for this company. The key stays on the server and the assistant only sees this company's data.")}>
            <form action={saveAssistant} className="space-y-3">
              <Field label={tx("Provider")}>
                <select name="provider" defaultValue={org.aiProvider || "openai"} className={fieldClass}>
                  <option value="openai">ChatGPT</option>
                  <option value="anthropic">Claude</option>
                  <option value="xai">Grok</option>
                </select>
              </Field>
              <Field label={tx("API key")} hint={org.aiKeyCipher ? tx("A key is saved. Leave this empty to keep it.") : tx("Paste the key from OpenAI, Anthropic or xAI.")}>
                <input name="apiKey" type="password" autoComplete="off" placeholder={org.aiKeyCipher ? "********" : "sk-..."} className={fieldClass} />
              </Field>
              <label className="flex items-center gap-2 text-[13px] text-muted">
                <input name="clear" type="checkbox" value="1" /> {tx("Remove the saved key")}
              </label>
              <div className="flex justify-end"><SubmitButton>{tx("Save")}</SubmitButton></div>
            </form>
          </Panel>
        ) : null}

        {section === "api" ? (
          <div className="space-y-5">
            <Panel title={tx("Access")}>
              <p className="text-[13px] text-muted">
                <span className="font-mono text-[12px] text-ink">GET /api/v1/products</span> {tx("with")} <span className="font-mono text-[12px] text-ink">Authorization: Bearer aera_…</span>
              </p>
              {admin ? <div className="mt-4"><ApiKeyForm /></div> : null}
            </Panel>
            {keys.length ? (
              <Panel title={tx("Keys")} flush>
                <ul>
                  {keys.map((key) => (
                    <li key={key.id} className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px]">
                      <span>{key.name}</span>
                      <span className="font-mono text-[12px] text-muted">{key.prefix}…</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        ) : null}

        {section === "import" ? (
          <Panel title={tx("Import products")} description={tx("CSV with a header row: name, sku, ean, price, cost, reorderPoint. Prices in euros.")}>
            {can(session.role, "catalog.write") ? (
              <form action={importProducts} className="flex flex-wrap items-center gap-3">
                <input name="file" type="file" accept=".csv,text/csv" required className="text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-[#f2f2f5] file:px-3 file:py-1.5 file:text-[13px] file:font-medium" />
                <SubmitButton>{tx("Import file")}</SubmitButton>
              </form>
            ) : (
              <p className="text-[13px] text-muted">{tx("No permission.")}</p>
            )}
          </Panel>
        ) : null}

        {section === "documents" ? (
          <Panel flush>
            {documents.length === 0 ? <EmptyState title={tx("No documents yet")} body={tx("Documents are created when you ship, receive goods, and issue invoices.")} /> : null}
            <ul>
              {documents.map((document) => {
                const href = entityHref(document.entityType, document.entityId);
                const body = (
                  <>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f2f2f5] text-muted"><FileText size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{document.title}</span>
                      <span className="block truncate font-mono text-[12px] text-muted">{document.filename}</span>
                    </span>
                    <Pill>{tx(documentKinds[document.kind] ?? document.kind)}</Pill>
                    <span className="w-24 text-right text-[12px] text-faint">{formatDay(document.createdAt)}</span>
                  </>
                );
                return (
                  <li key={document.id} className="border-b border-line last:border-0">
                    {href ? <Link href={href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-subtle">{body}</Link> : <div className="flex items-center gap-3 px-5 py-2.5">{body}</div>}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}

        {section === "activities" ? (
          <>
            <Tabs items={[{ href: "/settings?section=activities", label: tx("Timeline"), active: tab !== "audit" }, { href: "/settings?section=activities&tab=audit", label: tx("Audit"), active: tab === "audit" }]} />
            <Panel flush>
              <ul>
                {tab === "audit"
                  ? audits.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 text-[13px] last:border-0">
                        <span className="w-44 shrink-0 font-mono text-[12px] text-muted">{item.action}</span>
                        <span className="min-w-0 flex-1 truncate">{tx(item.summary)}</span>
                        <span className="shrink-0 text-[12px] text-faint">{item.actor?.name ?? tx("System")} · {formatWhen(item.createdAt)}</span>
                      </li>
                    ))
                  : activities.map((item) => {
                      const href = entityHref(item.entityType, item.entityId);
                      const row = (
                        <div className="flex gap-3">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.kind === "comment" ? "bg-accent" : "bg-line-strong"}`} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="truncate text-[13px] font-medium">{tx(item.title)}</span>
                              <span className="shrink-0 text-[12px] text-faint">{formatWhen(item.createdAt)}</span>
                            </span>
                            {item.body ? <span className="mt-0.5 block whitespace-pre-wrap text-[13px] text-muted">{item.body}</span> : null}
                            <span className="mt-0.5 block text-[12px] text-faint">{item.actor?.name ?? tx("System")}</span>
                          </span>
                        </div>
                      );
                      return (
                        <li key={item.id} className="border-b border-line last:border-0">
                          {href ? <Link href={href} className="block px-5 py-3 hover:bg-subtle">{row}</Link> : <div className="px-5 py-3">{row}</div>}
                        </li>
                      );
                    })}
              </ul>
            </Panel>
          </>
        ) : null}

        {section === "security" ? (
          <Panel title={tx("Two-factor sign-in")} description={tx("With an authenticator app such as 1Password or Google Authenticator.")}>
            {user.totpEnabled ? (
              <form action={disableTotp} className="flex flex-wrap items-end gap-3">
                <Pill tone="ok">{tx("Active")}</Pill>
                <input name="code" required placeholder={tx("Code to turn off")} className={`${fieldClass} max-w-[200px]`} />
                <SubmitButton variant="danger">{tx("Turn off")}</SubmitButton>
              </form>
            ) : (
              <div className="space-y-4">
                {user.totpSecret ? (
                  <>
                    <div className="rounded-lg bg-subtle p-3 ring-1 ring-line">
                      <div className="text-[12px] text-muted">{tx("Key for the app")}</div>
                      <div className="mt-1 break-all font-mono text-[13px]">{user.totpSecret}</div>
                    </div>
                    <form action={confirmTotpSetup} className="flex flex-wrap items-center gap-2">
                      <input name="code" required inputMode="numeric" placeholder={tx("6-digit code")} className={`${fieldClass} max-w-[200px]`} />
                      <SubmitButton>{tx("Enable")}</SubmitButton>
                    </form>
                  </>
                ) : (
                  <form action={startTotp}><SubmitButton variant="secondary">{tx("Set up")}</SubmitButton></form>
                )}
              </div>
            )}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
