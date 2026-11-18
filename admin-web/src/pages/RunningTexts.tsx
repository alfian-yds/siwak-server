import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { type RunningText, api } from "../api";
import { ConfirmAction, ErrorAlert, Loading, fieldErrors } from "../components/ui";
import { useMosque } from "../mosque";

const MAX = 300;
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });
const fmtDate = (d: string) => dateFmt.format(new Date(`${d}T00:00:00`));
const today = () => new Date().toLocaleDateString("en-CA");

function period(t: RunningText): string | null {
  if (t.startsOn && t.endsOn) return `${fmtDate(t.startsOn)} – ${fmtDate(t.endsOn)}`;
  if (t.startsOn) return `Mulai ${fmtDate(t.startsOn)}`;
  if (t.endsOn) return `Sampai ${fmtDate(t.endsOn)}`;
  return null;
}
function phase(t: RunningText): "aktif" | "nanti" | "lewat" | "mati" {
  if (!t.enabled) return "mati";
  const d = today();
  if (t.endsOn && t.endsOn < d) return "lewat";
  if (t.startsOn && t.startsOn > d) return "nanti";
  return "aktif";
}
const phaseLabel = { aktif: "Tampil", nanti: "Terjadwal", lewat: "Sudah lewat", mati: "Disembunyikan" } as const;

/** Teks berjalan (App Flow §4.5): tambah, ubah, urut, aktif/nonaktif, tanggal mulai/selesai. */
export function RunningTextsPage() {
  const { mosque } = useMosque();
  const qc = useQueryClient();
  const base = `/api/admin/mosques/${mosque.id}/running-texts`;
  const key = ["running-texts", mosque.id];
  const q = useQuery({ queryKey: key, queryFn: () => api<{ runningTexts: RunningText[] }>("GET", base) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [editing, setEditing] = useState<string | null>(null);

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api<{ runningTexts: RunningText[] }>("PUT", `${base}/order`, { ids }),
    onSuccess: (data) => qc.setQueryData(key, data),
    onError: refresh,
  });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<RunningText> }) => api("PATCH", `${base}/${id}`, body), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api("DELETE", `${base}/${id}`), onSuccess: refresh });

  const move = (list: RunningText[], i: number, dir: -1 | 1) => {
    const ids = list.map((t) => t.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };

  return (
    <div className="stack">
      <TextForm title="Tambah teks berjalan" submitLabel="Tambah" onSaved={refresh} url={base} method="POST" />
      <h2>Daftar teks</h2>
      <p className="muted small" style={{ margin: 0 }}>
        TV menampilkan teks yang aktif secara bergantian sesuai urutan ini. Perubahan sampai ke TV dalam 1 menit.
      </p>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorAlert error={q.error} />
      ) : q.data.runningTexts.length === 0 ? (
        <div className="card empty">Belum ada teks berjalan. Tambahkan pesan pertama.</div>
      ) : (
        <ol className="list plain">
          {q.data.runningTexts.map((t, i, list) => {
            const ph = phase(t);
            return (
              <li key={t.id} className="card stack rt-item">
                {editing === t.id ? (
                  <TextForm
                    initial={t}
                    submitLabel="Simpan"
                    url={`${base}/${t.id}`}
                    method="PATCH"
                    onSaved={() => {
                      setEditing(null);
                      void refresh();
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <div className={ph === "aktif" ? "rt-text" : "rt-text muted"}>{t.text}</div>
                    <div className="badges" style={{ marginTop: 0 }}>
                      <span className={ph === "aktif" ? "badge badge-accent" : ph === "lewat" ? "badge badge-danger" : "badge"}>{phaseLabel[ph]}</span>
                      {period(t) && <span className="badge">{period(t)}</span>}
                    </div>
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button type="button" className="btn btn-small" aria-label="Naikkan" disabled={i === 0 || reorder.isPending} onClick={() => move(list, i, -1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        aria-label="Turunkan"
                        disabled={i === list.length - 1 || reorder.isPending}
                        onClick={() => move(list, i, 1)}
                      >
                        ↓
                      </button>
                      <button type="button" className="btn btn-small" onClick={() => patch.mutate({ id: t.id, body: { enabled: !t.enabled } })}>
                        {t.enabled ? "Sembunyikan" : "Tampilkan"}
                      </button>
                      <button type="button" className="btn btn-small" onClick={() => setEditing(t.id)}>
                        Ubah
                      </button>
                    </div>
                    <ConfirmAction small label="Hapus" question="Hapus teks ini dari semua TV?" confirmLabel="Ya, hapus" busy={remove.isPending} onConfirm={() => remove.mutate(t.id)} />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <ErrorAlert error={reorder.error ?? patch.error ?? remove.error} />
    </div>
  );
}

function TextForm({
  title,
  initial,
  submitLabel,
  url,
  method,
  onSaved,
  onCancel,
}: {
  title?: string;
  initial?: RunningText;
  submitLabel: string;
  url: string;
  method: "POST" | "PATCH";
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? "");
  const [withDates, setWithDates] = useState(Boolean(initial?.startsOn || initial?.endsOn));
  const save = useMutation({
    mutationFn: () =>
      api(method, url, { text: text.trim(), startsOn: withDates && startsOn ? startsOn : null, endsOn: withDates && endsOn ? endsOn : null }),
    onSuccess: () => {
      if (method === "POST") {
        setText("");
        setStartsOn("");
        setEndsOn("");
        setWithDates(false);
      }
      onSaved();
    },
  });
  const errors = fieldErrors(save.error);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) save.mutate();
  };

  return (
    <form className={title ? "card stack" : "stack"} onSubmit={onSubmit} noValidate>
      {title && <h2>{title}</h2>}
      <label className="field">
        <span className="label">Teks</span>
        <textarea rows={3} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Mis. Kajian rutin Selasa ba'da Maghrib bersama Ust. Ahmad" aria-invalid={Boolean(errors.text)} />
        <span className={text.length > MAX - 30 ? "hint warn-text" : "hint"}>
          {text.length}/{MAX} karakter
        </span>
        {errors.text && <span className="error">{errors.text}</span>}
      </label>
      <label className="check">
        <input type="checkbox" checked={withDates} onChange={(e) => setWithDates(e.target.checked)} />
        <span>Tampilkan hanya pada tanggal tertentu</span>
      </label>
      {withDates && (
        <div className="grid-2">
          <label className="field">
            <span className="label">Mulai</span>
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Selesai</span>
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} aria-invalid={Boolean(errors.endsOn)} />
            {errors.endsOn && <span className="error">{errors.endsOn}</span>}
          </label>
        </div>
      )}
      {save.isError && Object.keys(errors).length === 0 && <ErrorAlert error={save.error} />}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={save.isPending || !text.trim()}>
          {save.isPending ? "Menyimpan…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
