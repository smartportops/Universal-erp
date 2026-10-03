"use client";

import { useActionState } from "react";
import { createApiKey } from "@/server/actions/platform";
import { useTx } from "@/lib/i18n-client";
import { fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ApiKeyForm() {
  const tx = useTx();
  const [state, action] = useActionState(createApiKey, null);
  return (
    <form action={action} className="space-y-3">
      <div className="flex gap-2">
        <input name="name" placeholder={tx("Name, e.g. shop connection")} className={fieldClass} />
        <SubmitButton variant="secondary">{tx("Create key")}</SubmitButton>
      </div>
      {state?.error ? <p className="text-[13px] text-danger">{tx(state.error)}</p> : null}
      {state?.secret ? (
        <div className="rounded-lg bg-subtle px-3 py-2.5 ring-1 ring-line">
          <div className="break-all font-mono text-[12px]">{state.secret}</div>
          <div className="mt-1 text-[12px] text-muted">{tx("Shown only once. After that only the prefix remains.")}</div>
        </div>
      ) : null}
    </form>
  );
}
