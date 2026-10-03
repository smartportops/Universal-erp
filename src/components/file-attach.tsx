"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";
import { useFormStatus } from "react-dom";
import { uploadAttachment } from "@/server/actions/platform";
import { useTx } from "@/lib/i18n-client";

function Picker() {
  const tx = useTx();
  const { pending } = useFormStatus();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        name="file"
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) event.target.form?.requestSubmit();
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted ring-1 ring-line-strong transition-colors hover:bg-subtle hover:text-ink disabled:opacity-50"
      >
        <Paperclip size={13} />
        {pending ? tx("Uploading…") : tx("Attach file")}
      </button>
    </>
  );
}

export function FileAttach({ entityType, entityId, returnTo }: { entityType: string; entityId: string; returnTo: string }) {
  return (
    <form action={uploadAttachment}>
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Picker />
    </form>
  );
}
