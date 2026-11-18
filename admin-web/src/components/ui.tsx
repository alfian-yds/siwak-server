import { type ReactNode, useId, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api";

export function PageHead({ title, back, action }: { title: string; back?: { to: string; label: string }; action?: ReactNode }) {
  return (
    <>
      {back && (
        <Link className="back" to={back.to}>
          ← {back.label}
        </Link>
      )}
      <div className="page-head">
        <h1>{title}</h1>
        {action}
      </div>
    </>
  );
}

/** Label + isian + petunjuk + pesan galat, terhubung lewat aria. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && (
        <div className="hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {error && (
        <div className="error" id={`${id}-err`}>
          {error}
        </div>
      )}
    </div>
  );
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof ApiError || error instanceof Error ? error.message : "Terjadi kesalahan.";
  return (
    <div className="alert alert-error" role="alert">
      {message}
    </div>
  );
}

export const fieldErrors = (error: unknown): Record<string, string> => (error instanceof ApiError ? error.fields : {});

export function Loading() {
  return <div className="loading">Memuat…</div>;
}

/**
 * Tombol berbahaya yang meminta konfirmasi di halaman (Design Brief §9), bukan dialog bawaan browser.
 */
export function ConfirmAction({
  label,
  question,
  confirmLabel,
  danger = true,
  busy,
  small = false,
  onConfirm,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  /** Ukuran tombol kecil, agar sejajar dengan tombol kecil lain di baris yang sama. */
  small?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className={`${danger ? "btn btn-ghost-danger" : "btn"}${small ? " btn-small" : ""}`} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className={danger ? "confirm stack" : "confirm confirm-neutral stack"} role="group" aria-label={label}>
      <div>{question}</div>
      <div className="actions">
        <button type="button" className={danger ? "btn btn-danger" : "btn btn-primary"} disabled={busy} onClick={onConfirm}>
          {busy ? "Memproses…" : confirmLabel}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>
          Batal
        </button>
      </div>
    </div>
  );
}

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
export const formatDateTime = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : "—");

export const TIMEZONES = [
  { value: "Asia/Jakarta", label: "WIB (Asia/Jakarta)" },
  { value: "Asia/Makassar", label: "WITA (Asia/Makassar)" },
  { value: "Asia/Jayapura", label: "WIT (Asia/Jayapura)" },
] as const;
export const timezoneLabel = (tz: string) => TIMEZONES.find((t) => t.value === tz)?.label.split(" ")[0] ?? tz;
