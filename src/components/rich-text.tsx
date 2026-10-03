"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bold, Code2, Italic, List, ListOrdered, Underline } from "lucide-react";
import { updateRecord } from "@/server/actions/records";
import { cn } from "@/lib/format";
import { useTx } from "@/lib/i18n-client";

const blocks = [
  ["p", "Paragraph"],
  ["h1", "Heading 1"],
  ["h2", "Heading 2"],
  ["h3", "Heading 3"],
  ["h4", "Heading 4"],
  ["h5", "Heading 5"],
  ["h6", "Heading 6"],
] as const;

export function RichText({ entity, id, field, value, disabled, placeholder = "Describe the product", onChange }: { entity: string; id: string; field: string; value: string; disabled?: boolean; placeholder?: string; onChange?: (html: string) => void }) {
  const tx = useTx();
  const router = useRouter();
  const editor = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(value);
  const [source, setSource] = useState(false);
  const [block, setBlock] = useState("p");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = html !== value;

  useEffect(() => {
    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand("styleWithCSS", false, "false");
  }, []);

  useEffect(() => {
    setHtml(value);
    if (editor.current && !source && editor.current.innerHTML !== value) editor.current.innerHTML = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!source && editor.current && editor.current.innerHTML !== html) editor.current.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (!saved) return;
    const handle = setTimeout(() => setSaved(false), 1400);
    return () => clearTimeout(handle);
  }, [saved]);

  function run(command: string, arg?: string) {
    editor.current?.focus();
    document.execCommand(command, false, arg);
    setHtml(editor.current?.innerHTML ?? "");
    readBlock();
  }

  function readBlock() {
    const node = window.getSelection()?.anchorNode;
    let el: HTMLElement | null = node instanceof HTMLElement ? node : node?.parentElement ?? null;
    while (el && el !== editor.current) {
      const tag = el.tagName.toLowerCase();
      if (/^(p|h[1-6])$/.test(tag)) {
        setBlock(tag);
        return;
      }
      el = el.parentElement;
    }
    setBlock("p");
  }

  function save() {
    setError("");
    start(async () => {
      const result = await updateRecord(entity, id, field, html);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else setError(result.error);
    });
  }

  if (disabled) {
    return html ? (
      <div className="prose-aera text-[13px] leading-6" dangerouslySetInnerHTML={{ __html: html }} />
    ) : (
      <p className="text-[13px] text-faint">{tx(placeholder)}</p>
    );
  }

  const tool = "grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-ink/[0.05] hover:text-ink disabled:opacity-40";

  return (
    <div className={cn("rounded-xl ring-1 ring-line-strong focus-within:ring-2 focus-within:ring-accent/40", saved && "ring-ok/60")}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1.5">
        <select
          value={block}
          disabled={source}
          onChange={(event) => run("formatBlock", event.target.value)}
          className="mr-1 h-7 cursor-pointer rounded-md bg-transparent px-1.5 text-[12px] text-muted outline-none hover:bg-ink/[0.05] hover:text-ink disabled:opacity-40"
        >
          {blocks.map(([tag, label]) => (
            <option key={tag} value={tag}>{tx(label)}</option>
          ))}
        </select>
        <button type="button" className={tool} disabled={source} onMouseDown={(event) => event.preventDefault()} onClick={() => run("bold")} title={tx("Bold")}><Bold size={14} /></button>
        <button type="button" className={tool} disabled={source} onMouseDown={(event) => event.preventDefault()} onClick={() => run("italic")} title={tx("Italic")}><Italic size={14} /></button>
        <button type="button" className={tool} disabled={source} onMouseDown={(event) => event.preventDefault()} onClick={() => run("underline")} title={tx("Underline")}><Underline size={14} /></button>
        <span className="mx-1 h-4 w-px bg-line" />
        <button type="button" className={tool} disabled={source} onMouseDown={(event) => event.preventDefault()} onClick={() => run("insertUnorderedList")} title={tx("Bullet list")}><List size={14} /></button>
        <button type="button" className={tool} disabled={source} onMouseDown={(event) => event.preventDefault()} onClick={() => run("insertOrderedList")} title={tx("Numbered list")}><ListOrdered size={14} /></button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setSource((value) => !value)}
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px]", source ? "bg-ink text-primary-ink" : "text-muted hover:bg-ink/[0.05] hover:text-ink")}
          title={tx("Edit HTML")}
        >
          <Code2 size={14} /> HTML
        </button>
      </div>
      {source ? (
        <textarea
          value={html}
          onChange={(event) => {
            setHtml(event.target.value);
            if (onChange && event.target.value !== value) onChange(event.target.value);
          }}
          spellCheck={false}
          rows={10}
          className="block w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[12px] leading-5 outline-none"
        />
      ) : (
        <div className="relative">
          {!html ? <div className="pointer-events-none absolute left-3 top-2.5 text-[13px] text-faint">{tx(placeholder)}</div> : null}
          <div
            ref={editor}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              const next = editor.current?.innerHTML ?? "";
              setHtml(next);
              if (onChange && next !== value) onChange(next);
            }}
            onKeyUp={readBlock}
            onMouseUp={readBlock}
            className="prose-aera min-h-[140px] px-3 py-2.5 text-[13px] leading-6 outline-none"
          />
        </div>
      )}
      {onChange ? null : <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
        <span className="text-[12px] text-danger">{error ? tx(error) : ""}</span>
        <div className="flex items-center gap-2">
          {dirty ? (
            <button type="button" onClick={() => { setHtml(value); if (editor.current) editor.current.innerHTML = value; }} className="h-7 rounded-md px-2 text-[12px] text-muted hover:text-ink">
              {tx("Discard")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-ink disabled:opacity-40"
          >
            {pending ? tx("Saving") : saved && !dirty ? tx("Saved") : tx("Save")}
          </button>
        </div>
      </div>}
    </div>
  );
}
