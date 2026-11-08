"use client";

import { useState } from "react";

type CopyState = "idle" | "copied" | "failed";

const RESET_DELAY_MS = 2000 as const;

interface CopyButtonProps {
  text: string;
}

export default function CopyButton({ text }: CopyButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  function settle(next: CopyState): void {
    setCopyState(next);
    window.setTimeout(() => setCopyState("idle"), RESET_DELAY_MS);
  }

  function onCopyClick(): void {
    navigator.clipboard.writeText(text).then(
      () => settle("copied"),
      () => settle("failed"),
    );
  }

  return (
    <button
      type="button"
      className="btn btn-primary rk-lamp fs-[var(--font-size-sm)] rounded-[var(--radius-pill)]"
      data-copy-state={copyState}
      onClick={onCopyClick}
    >
      {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
    </button>
  );
}
