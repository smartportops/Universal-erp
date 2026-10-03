"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { uploadProductImages } from "@/server/actions/product-media";
import { cn } from "@/lib/format";
import { useTx } from "@/lib/i18n-client";

export function ImageUpload({ productId, compact = false, onFiles }: { productId?: string; compact?: boolean; onFiles?: (files: File[]) => void }) {
  const tx = useTx();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  return (
    <form
      ref={form}
      action={uploadProductImages}
      onSubmit={() => setBusy(true)}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!event.dataTransfer.files.length) return;
        if (onFiles) {
          onFiles(Array.from(event.dataTransfer.files));
          return;
        }
        const input = form.current?.elements.namedItem("files") as HTMLInputElement | null;
        if (!input) return;
        input.files = event.dataTransfer.files;
        form.current?.requestSubmit();
      }}
      className={cn(compact ? "" : "block")}
    >
      <input type="hidden" name="productId" value={productId} />
      <label
        className={cn(
          "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-[13px] text-muted transition-colors hover:border-ink/40 hover:text-ink",
          compact ? "aspect-square flex-col" : "h-28",
          over ? "border-accent bg-soft text-accent" : "border-line-strong",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <ImagePlus size={compact ? 18 : 16} />
        <span className={cn(compact && "text-[12px]")}>{busy ? tx("Uploading") : compact ? tx("Add") : tx("Drop images here or click to upload")}</span>
        <input
          type="file"
          name="files"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files;
            if (!chosen?.length) return;
            if (onFiles) {
              onFiles(Array.from(chosen));
              event.target.value = "";
              return;
            }
            form.current?.requestSubmit();
          }}
        />
      </label>
    </form>
  );
}
