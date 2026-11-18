import { type ReactNode, useId } from "react";

/** Kontrol `−  +2  +` untuk angka menit (Design Brief §9): tombol besar, bukan isian teks. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  signed = false,
  unit = "menit",
  error,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  signed?: boolean;
  unit?: string;
  error?: string;
}) {
  const id = useId();
  const shown = signed && value > 0 ? `+${value}` : String(value);
  return (
    <div className="stepper-row">
      <span className="stepper-label" id={id}>
        {label}
        {error && <span className="error small"> · {error}</span>}
      </span>
      <div className="stepper" role="group" aria-labelledby={id}>
        <button type="button" aria-label={`Kurangi ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          −
        </button>
        <output aria-live="polite">
          <span className="mono">{shown}</span>
          {unit && <span className="unit"> {unit}</span>}
        </output>
        <button type="button" aria-label={`Tambah ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          +
        </button>
      </div>
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="toggle" htmlFor={id}>
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

/** Pilihan beberapa opsi sebagai deretan tombol (radio). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean; note?: string }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const name = useId();
  return (
    <fieldset className="segmented-field">
      <legend>{label}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={String(o.value)} className={o.disabled ? "disabled" : undefined} title={o.note}>
            <input type="radio" name={name} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </fieldset>
  );
}

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="card stack">
      <div>
        <h2>{title}</h2>
        {description && <p className="muted small" style={{ margin: "4px 0 0" }}>{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Bilah simpan yang menempel di bawah layar saat ada perubahan. */
export function SaveBar({ dirty, saving, onSave, onReset, message }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; message?: ReactNode }) {
  if (!dirty && !message) return null;
  return (
    <div className="savebar" role="region" aria-label="Simpan perubahan">
      <div className="savebar-inner">
        <span className="small">{dirty ? "Ada perubahan yang belum disimpan." : message}</span>
        {dirty && (
          <div className="actions" style={{ margin: 0 }}>
            <button type="button" className="btn btn-small" onClick={onReset} disabled={saving}>
              Batalkan
            </button>
            <button type="button" className="btn btn-primary btn-small" onClick={onSave} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
