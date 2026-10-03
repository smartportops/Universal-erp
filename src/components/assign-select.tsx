"use client";

import { assignTask } from "@/server/actions/inbox";
import { useTx } from "@/lib/i18n-client";

export function AssignSelect({ id, assigneeId, people }: { id: string; assigneeId: string; people: { id: string; name: string }[] }) {
  const tx = useTx();
  return (
    <form action={assignTask}>
      <input type="hidden" name="id" value={id} />
      <select
        name="assigneeId"
        defaultValue={assigneeId}
        aria-label={tx("Assign to")}
        onChange={(event) => event.target.form?.requestSubmit()}
        className="max-w-[150px] cursor-pointer truncate bg-transparent text-right text-[12px] text-muted outline-none"
      >
        <option value="">{tx("Unassigned")}</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>{person.name}</option>
        ))}
      </select>
    </form>
  );
}
