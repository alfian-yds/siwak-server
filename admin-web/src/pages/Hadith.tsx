import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type ContentItem, api } from "../api";
import { ConfirmAction, ErrorAlert, Loading, PageHead, fieldErrors, formatDateTime } from "../components/ui";
import { HADITH_CATEGORIES, STATUS_LABEL, categoryLabel } from "../labels";
import { useMosque } from "../mosque";
import { HadithDisplaySettings } from "./SettingsPages";

export interface HadithValues {
  category: string;
  arabicText: string;
  translation: string;
  sourceRef: string;
  gradeNote: string;
}
const empty: HadithValues = {
  category: "keutamaan",
  arabicText: "",
  translation: "",
  sourceRef: "",
  gradeNote: "",
};
const fromItem = (c: ContentItem): HadithValues => ({
  category: c.category ?? "keutamaan",
  arabicText: c.arabicText ?? "",
  translation: c.translation ?? "",
  sourceRef: c.sourceRef ?? "",
  gradeNote: c.gradeNote ?? "",
});
export const toPayload = (v: HadithValues) => ({
  category: v.category,
  arabicText: v.arabicText.trim() || null,
  translation: v.translation.trim(),
  sourceRef: v.sourceRef.trim(),
  gradeNote: v.gradeNote.trim() || null,
});

/** Formulir hadits (App Flow §4.8): kategori, teks Arab (opsional), terjemah, sumber, catatan derajat. */
export function HadithForm({
  initial,
  submitLabel,
  extra,
  errors,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: ContentItem;
  submitLabel: string;
  extra?: (v: HadithValues) => React.ReactNode;
  errors: Record<string, string>;
  busy: boolean;
  onSubmit: (v: HadithValues) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<HadithValues>(initial ? fromItem(initial) : empty);
  const set = (k: keyof HadithValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="stack"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(v);
      }}
      noValidate
    >
      <label className="field">
        <span className="label">Kategori</span>
        <select value={v.category} onChange={set("category")}>
          {HADITH_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Teks Arab (opsional)</span>
        <textarea dir="rtl" lang="ar" className="arabic" rows={3} maxLength={2000} value={v.arabicText} onChange={set("arabicText")} />
        {errors.arabicText && <span className="error">{errors.arabicText}</span>}
      </label>
      <label className="field">
        <span className="label">Terjemah</span>
        <textarea rows={4} maxLength={600} value={v.translation} onChange={set("translation")} aria-invalid={Boolean(errors.translation)} />
        <span className={v.translation.length > 570 ? "hint warn-text" : "hint"}>{v.translation.length}/600 karakter</span>
        {errors.translation && <span className="error">{errors.translation}</span>}
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="label">Sumber</span>
          <input
            type="text"
            maxLength={120}
            placeholder="HR. Muslim"
            value={v.sourceRef}
            onChange={set("sourceRef")}
            aria-invalid={Boolean(errors.sourceRef)}
          />
          {errors.sourceRef && <span className="error">{errors.sourceRef}</span>}
        </label>
        <label className="field">
          <span className="label">Catatan derajat (opsional)</span>
          <input type="text" maxLength={200} placeholder="mis. shahih" value={v.gradeNote} onChange={set("gradeNote")} />
        </label>
      </div>
      {extra?.(v)}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Menyimpan…" : submitLabel}
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

export function HadithCard({ c, children }: { c: ContentItem; children?: React.ReactNode }) {
  return (
    <div className="card stack hadith-card">
      <div className="badges" style={{ marginTop: 0 }}>
        <span className="badge">{categoryLabel(c.category)}</span>
        <span className={c.status === "verified" || c.status === "published" ? "badge badge-accent" : c.status === "rejected" ? "badge badge-danger" : "badge"}>
          {STATUS_LABEL[c.status]}
        </span>
      </div>
      {c.arabicText && (
        <div className="arabic" dir="rtl" lang="ar">
          {c.arabicText}
        </div>
      )}
      <div>“{c.translation}”</div>
      <div className="muted small">
        {c.sourceRef}
        {c.gradeNote ? ` · ${c.gradeNote}` : ""}
      </div>
      {children}
    </div>
  );
}

// ---- Hadits milik masjid ---------------------------------------------------------------

export function MosqueHadithPage() {
  const { mosque } = useMosque();
  const qc = useQueryClient();
  const base = `/api/admin/mosques/${mosque.id}/content`;
  const key = ["content", mosque.id, "hadith"];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<{ content: ContentItem[] }>("GET", `${base}?type=hadith`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState<"published" | "draft">("published");

  const create = useMutation({
    mutationFn: (v: HadithValues) => api("POST", base, { type: "hadith", ...toPayload(v), status }),
    onSuccess: () => {
      setAdding(false);
      void refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, v, st }: { id: string; v: HadithValues; st: string }) => api("PUT", `${base}/${id}`, { ...toPayload(v), status: st }),
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
  });
  const submit = useMutation({
    mutationFn: (id: string) => api("POST", `${base}/${id}/submit`),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api("DELETE", `${base}/${id}`),
    onSuccess: refresh,
  });

  return (
    <div className="stack">
      <AiringHadiths />
      <HadithDisplaySettings />
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h2>Hadits milik masjid</h2>
        {!adding && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            Tambah hadits
          </button>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Hadits yang Anda tulis sendiri tayang di TV masjid ini. Admin masjid bertanggung jawab atas kebenarannya. Ajukan ke kumpulan hadits SIWAK agar bisa
        dipakai masjid lain setelah diperiksa.
      </p>
      {adding && (
        <div className="card">
          <HadithForm
            submitLabel="Simpan hadits"
            errors={fieldErrors(create.error)}
            busy={create.isPending}
            onSubmit={(v) => create.mutate(v)}
            onCancel={() => setAdding(false)}
            extra={() => (
              <label className="check">
                <input type="checkbox" checked={status === "draft"} onChange={(e) => setStatus(e.target.checked ? "draft" : "published")} />
                <span>Simpan sebagai draf (belum tayang di TV)</span>
              </label>
            )}
          />
          <ErrorAlert error={Object.keys(fieldErrors(create.error)).length ? null : create.error} />
        </div>
      )}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorAlert error={q.error} />
      ) : q.data.content.length === 0 ? (
        <div className="card empty">
          Belum ada hadits milik masjid ini. Hadits otomatis dari kumpulan hadits SIWAK tetap tayang sesuai tema yang dicentang di atas.
        </div>
      ) : (
        <div className="list">
          {q.data.content.map((c) =>
            editing === c.id ? (
              <div key={c.id} className="card">
                <HadithForm
                  initial={c}
                  submitLabel="Simpan"
                  errors={fieldErrors(update.error)}
                  busy={update.isPending}
                  onSubmit={(v) => update.mutate({ id: c.id, v, st: c.status })}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <HadithCard key={c.id} c={c}>
                {c.submission && (
                  <div className={c.submission.status === "rejected" ? "alert alert-warn small" : "muted small"}>
                    Kumpulan hadits SIWAK: {STATUS_LABEL[c.submission.status]}
                    {c.submission.reviewNote ? ` · Catatan pemeriksa: ${c.submission.reviewNote}` : ""}
                  </div>
                )}
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn btn-small" onClick={() => setEditing(c.id)}>
                    Ubah
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() =>
                      update.mutate({
                        id: c.id,
                        v: fromItem(c),
                        st: c.status === "draft" ? "published" : "draft",
                      })
                    }
                  >
                    {c.status === "draft" ? "Tayangkan" : "Jadikan draf"}
                  </button>
                  {c.submission?.status !== "verified" && c.submission?.status !== "submitted" && (
                    <button className="btn btn-small" onClick={() => submit.mutate(c.id)} disabled={submit.isPending}>
                      {c.submission?.status === "rejected" ? "Ajukan ulang" : "Ajukan ke kumpulan hadits SIWAK"}
                    </button>
                  )}
                </div>
                <ConfirmAction small label="Hapus" question="Hapus hadits ini dari masjid?" confirmLabel="Ya, hapus" onConfirm={() => remove.mutate(c.id)} />
              </HadithCard>
            ),
          )}
        </div>
      )}
      <ErrorAlert error={submit.error ?? remove.error ?? update.error} />
    </div>
  );
}

// ---- Pustaka pusat & verifikasi (super admin) -----------------------------------------

const TABS = [
  { id: "submitted", label: "Diajukan masjid" },
  { id: "draft", label: "Draf (belum tayang)" },
  { id: "verified", label: "Terverifikasi (tayang)" },
  { id: "rejected", label: "Dikembalikan" },
] as const;

/** Hadits yang benar-benar tayang di TV masjid ini (sama dengan isi bundle TV). */
function AiringHadiths() {
  const { mosque } = useMosque();
  const q = useQuery({
    queryKey: ["preview", mosque.id],
    queryFn: () =>
      api<{
        settings: {
          display: {
            content: { enabled: boolean; autoHadith?: boolean };
            layout: string;
            mutiaraHadits: {
              enabled: boolean;
              everyMinutes: number;
              showSeconds: number;
            };
            hadithCategories: string[];
          };
        };
        content: ContentItem[];
      }>("GET", `/api/admin/mosques/${mosque.id}/preview`),
  });
  if (!q.data) return q.isError ? <ErrorAlert error={q.error} /> : null;
  const list = q.data.content.filter((c) => c.type === "hadith" && c.translation);
  const m = q.data.settings.display.mutiaraHadits;
  const on = q.data.settings.display.content.enabled;
  return (
    <section className="card stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h2>Yang tayang di TV ({list.length})</h2>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {!on
          ? "Slide & hadits sedang dimatikan, jadi hadits tidak tampil di TV. "
          : q.data.settings.display.content.autoHadith === false
            ? "Hadits otomatis dimatikan: hanya hadits yang Anda jadikan slide yang tayang. "
            : `${q.data.settings.display.layout === "GALERI" ? "Diputar di samping jam bersama slide. " : ""}${m.enabled ? `Satu layar penuh setiap ${m.everyMinutes} menit selama ${m.showSeconds} detik. ` : ""}`}
        <Link to={`/m/${mosque.id}/konten`}>Atur di menu Slide</Link>
      </p>
      {list.length === 0 ? (
        <div className="feature-note">
          <span>
            Belum ada hadits yang bisa tayang. Nyalakan hadits otomatis dan centang temanya di bawah, atau jadikan hadits sebagai slide di menu Slide.
          </span>
        </div>
      ) : (
        <ul className="pool-list">
          {list.map((c) => (
            <li key={c.id} className="small">
              <strong>{categoryLabel(c.category)}</strong> · {c.translation?.slice(0, 140)}
              {(c.translation?.length ?? 0) > 140 ? "…" : ""} <span className="muted">({c.sourceRef ?? "tanpa sumber"})</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LibraryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("submitted");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const q = useQuery({
    queryKey: ["library", tab],
    queryFn: () => api<{ content: ContentItem[] }>("GET", `/api/admin/library?status=${tab}`),
  });
  // Jumlah per tab, agar hadits yang menunggu tidak tersembunyi di tab lain.
  const counts = useQuery({
    queryKey: ["library", "counts"],
    queryFn: async () => {
      const ids = TABS.map((t) => t.id);
      const lists = await Promise.all(ids.map((id) => api<{ content: ContentItem[] }>("GET", `/api/admin/library?status=${id}`)));
      return Object.fromEntries(ids.map((id, i) => [id, lists[i]!.content.length])) as Record<(typeof TABS)[number]["id"], number>;
    },
  });
  const [autoTab, setAutoTab] = useState(false);
  useEffect(() => {
    if (autoTab || !counts.data) return;
    setAutoTab(true);
    if (counts.data.submitted === 0 && counts.data.draft > 0) setTab("draft");
  }, [counts.data, autoTab]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["library"] });

  const create = useMutation({
    mutationFn: (v: HadithValues) => api("POST", "/api/admin/library", toPayload(v)),
    onSuccess: () => {
      setAdding(false);
      setTab("draft");
      void refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, v }: { id: string; v: HadithValues }) => api("PUT", `/api/admin/library/${id}`, toPayload(v)),
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
  });
  const review = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: "verify" | "reject" | "unverify"; note?: string }) =>
      api("POST", `/api/admin/library/${id}/review`, {
        decision,
        note: note ?? "",
      }),
    onSuccess: () => {
      setNoteFor(null);
      setNote("");
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api("DELETE", `/api/admin/library/${id}`),
    onSuccess: refresh,
  });

  return (
    <div className="stack">
      <PageHead
        title="Kumpulan hadits SIWAK"
        action={
          !adding && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              Tambah hadits
            </button>
          )
        }
      />
      <p className="muted small" style={{ margin: 0 }}>
        Hadits di sini tayang di semua masjid sesuai tema yang mereka centang, tetapi hanya setelah diperiksa (terverifikasi). Periksa teks Arab, terjemah,
        sumber, dan derajat sebelum menyetujui.
      </p>
      {adding && (
        <div className="card">
          <HadithForm
            submitLabel="Simpan sebagai draf"
            errors={fieldErrors(create.error)}
            busy={create.isPending}
            onSubmit={(v) => create.mutate(v)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      <div className="segmented" role="tablist">
        {TABS.map((t) => (
          <label key={t.id}>
            <input type="radio" name="libtab" checked={tab === t.id} onChange={() => setTab(t.id)} />
            <span>
              {t.label}
              {counts.data && ` (${counts.data[t.id]})`}
            </span>
          </label>
        ))}
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorAlert error={q.error} />
      ) : q.data.content.length === 0 ? (
        <div className="card empty">{tab === "submitted" ? "Tidak ada hadits yang menunggu verifikasi." : "Kosong."}</div>
      ) : (
        <div className="list">
          {q.data.content.map((c) =>
            editing === c.id ? (
              <div key={c.id} className="card">
                <HadithForm
                  initial={c}
                  submitLabel="Simpan"
                  errors={fieldErrors(update.error)}
                  busy={update.isPending}
                  onSubmit={(v) => update.mutate({ id: c.id, v })}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <HadithCard key={c.id} c={c}>
                {c.originItemId && <div className="muted small">Diajukan oleh pengurus masjid</div>}
                {!c.arabicText && c.status !== "verified" && (
                  <div className="muted small">Teks Arab belum diisi. Boleh tayang tanpa teks Arab, atau tambahkan dari sumber terpercaya lewat Ubah.</div>
                )}
                {c.reviewNote && <div className="muted small">Catatan: {c.reviewNote}</div>}
                {c.reviewedAt && <div className="muted small">Diperiksa {formatDateTime(c.reviewedAt)}</div>}
                {noteFor === c.id ? (
                  <div className="stack">
                    <label className="field">
                      <span className="label">Alasan dikembalikan</span>
                      <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button
                        className="btn btn-danger btn-small"
                        disabled={!note.trim() || review.isPending}
                        onClick={() => review.mutate({ id: c.id, decision: "reject", note })}
                      >
                        Kembalikan
                      </button>
                      <button className="btn btn-small" onClick={() => setNoteFor(null)}>
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="actions" style={{ marginTop: 0 }}>
                    {c.status !== "verified" && (
                      <button className="btn btn-primary btn-small" disabled={review.isPending} onClick={() => review.mutate({ id: c.id, decision: "verify" })}>
                        Setujui dan tayangkan
                      </button>
                    )}
                    {c.status === "submitted" && (
                      <button className="btn btn-small" onClick={() => setNoteFor(c.id)}>
                        Kembalikan dengan catatan
                      </button>
                    )}
                    {c.status === "verified" && (
                      <button className="btn btn-small" onClick={() => review.mutate({ id: c.id, decision: "unverify" })}>
                        Tarik dari tayangan
                      </button>
                    )}
                    <button className="btn btn-small" onClick={() => setEditing(c.id)}>
                      Ubah
                    </button>
                  </div>
                )}
                {c.status !== "verified" && (
                  <ConfirmAction
                    label="Hapus"
                    question="Hapus hadits ini dari kumpulan hadits SIWAK?"
                    confirmLabel="Ya, hapus"
                    onConfirm={() => remove.mutate(c.id)}
                  />
                )}
              </HadithCard>
            ),
          )}
        </div>
      )}
      <ErrorAlert error={review.error ?? remove.error} />
    </div>
  );
}
