"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui";

export function DemoLoginButton({ id, label, detail, disabled }: { id: string; label: string; detail: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't sign in");
      window.location.assign(body.redirect);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={signIn}
        disabled={busy || disabled}
        className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left transition hover:border-brand hover:bg-surface-2 disabled:opacity-60"
      >
        <Avatar name={label} id={id} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{label}</span>
          <span className="block truncate text-xs text-muted">{detail}</span>
        </span>
        {busy ? (
          <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
        ) : (
          <ChevronRight className="size-4 text-muted" aria-hidden />
        )}
      </button>
      {error && <p className="text-xs text-bad">{error}</p>}
    </>
  );
}
