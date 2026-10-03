import Link from "next/link";
import { Paperclip } from "lucide-react";
import { formatWhen } from "@/lib/format";
import { addComment } from "@/server/actions/platform";
import { InlineCustomField } from "@/components/inline-edit";
import { FileAttach } from "@/components/file-attach";
import { translator } from "@/lib/i18n-server";
import { Panel, Properties } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type ActivityItem = { id: string; title: string; body: string; at: Date; actor: string | null; kind: string };
type FieldItem = { definitionId: string; label: string; value: string };
type FileItem = { id: string; filename: string };

export function DetailLayout({ children, side }: { children: React.ReactNode; side?: React.ReactNode }) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">{children}</div>
      {side ? <div className="min-w-0 space-y-5 xl:sticky xl:top-8">{side}</div> : null}
    </div>
  );
}

export async function ActivityFeed({
  entityType,
  entityId,
  activities,
  canComment,
  returnTo,
}: {
  entityType: string;
  entityId: string;
  activities: ActivityItem[];
  canComment: boolean;
  returnTo: string;
}) {
  const tx = await translator();
  return (
    <Panel title={tx("Activity")}>
      {canComment ? (
        <form action={addComment} className="mb-5 rounded-xl ring-1 ring-line-strong focus-within:ring-2 focus-within:ring-accent/40">
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <textarea name="body" required rows={2} placeholder={tx("Write a note for the team…")} className="block w-full resize-none rounded-xl bg-transparent px-3 pt-2.5 text-[13px] outline-none placeholder:text-faint" />
          <div className="flex justify-end px-2 pb-2">
            <SubmitButton variant="secondary" size="sm" pendingLabel="Saving">{tx("Note")}</SubmitButton>
          </div>
        </form>
      ) : null}
      {activities.length === 0 ? <p className="text-[13px] text-muted">{tx("No entries yet.")}</p> : null}
      <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
        {activities.map((item) => (
          <li key={item.id} className="relative pl-6">
            <span className={`absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full ring-[3px] ring-surface ${item.kind === "comment" ? "bg-accent" : "bg-line-strong"}`} />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-[13px] font-medium">{tx(item.title)}</span>
              <span className="text-[12px] text-faint">{formatWhen(item.at)}</span>
            </div>
            {item.body ? (
              <p className={`mt-0.5 whitespace-pre-wrap text-[13px] ${item.kind === "comment" ? "rounded-lg bg-subtle px-3 py-2 text-ink ring-1 ring-line" : "text-muted"}`}>{item.body}</p>
            ) : null}
            {item.actor ? <div className="mt-0.5 text-[12px] text-faint">{item.actor}</div> : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export async function EntityFields({
  entityType,
  entityId,
  fields,
  files,
  canEdit,
  returnTo,
}: {
  entityType: string;
  entityId: string;
  fields: FieldItem[];
  files: FileItem[];
  canEdit: boolean;
  returnTo: string;
}) {
  const tx = await translator();
  const showFiles = files.length > 0 || canEdit;
  if (!fields.length && !showFiles) return null;
  return (
    <>
      {fields.length ? (
        <Panel title={tx("More details")}>
          <Properties
            items={fields.map((field) => ({
              label: field.label,
              value: <InlineCustomField definitionId={field.definitionId} entityId={entityId} value={field.value} disabled={!canEdit} />,
            }))}
          />
        </Panel>
      ) : null}
      {showFiles ? (
        <Panel title={tx("Files")} action={canEdit ? <FileAttach entityType={entityType} entityId={entityId} returnTo={returnTo} /> : undefined}>
          {files.length ? (
            <ul className="space-y-1 text-[13px]">
              {files.map((file) => (
                <li key={file.id}>
                  <Link href={`/api/files/${file.id}`} className="inline-flex items-center gap-1.5 text-accent hover:underline">
                    <Paperclip size={13} /> {file.filename}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">{tx("No files yet. PDFs, images and documents up to 5 MB.")}</p>
          )}
        </Panel>
      ) : null}
    </>
  );
}
