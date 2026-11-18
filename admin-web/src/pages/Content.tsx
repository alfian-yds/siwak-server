import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { type ContentItem, type Overview, type Slide, api, mediaUrl } from "../api";
import { Stepper } from "../components/controls";
import { MediaPicker } from "../components/MediaPicker";
import { ConfirmAction, ErrorAlert, Loading, fieldErrors } from "../components/ui";
import { CONTENT_TYPE_LABEL, DAYS, HARI_BESAR, categoryLabel, contentSummary, rupiah } from "../labels";
import { Icon, type IconName } from "../components/Icon";
import { useMosque } from "../mosque";
import { ContentDisplaySettings } from "./SettingsPages";

type InfoType = "info_teks" | "info_kas" | "info_jumat" | "info_agenda" | "info_hari_besar";
/** Pilihan saat menambah konten slide, dengan penjelasan singkat agar pengurus tahu isinya. */
const NEW_CONTENT: { type: InfoType | "image"; icon: IconName; hint: string }[] = [
  { type: "info_teks", icon: "note", hint: "Judul dan isi teks bebas" },
  { type: "info_kas", icon: "wallet", hint: "Saldo, pemasukan, pengeluaran" },
  { type: "info_jumat", icon: "mosque", hint: "Khatib, imam, muadzin" },
  { type: "info_agenda", icon: "calendar", hint: "Kajian dan kegiatan rutin" },
  { type: "info_hari_besar", icon: "moon", hint: "Hitung mundur hari besar Islam" },
  { type: "image", icon: "image", hint: "Poster atau foto kegiatan" },
];
const today = () => new Date().toLocaleDateString("en-CA");

const daysText = (mask: number) => (mask === 127 ? "Setiap hari" : DAYS.filter((_, i) => mask & (1 << i)).join(", "));

/** Slide: cara tampil, urutan slide, info masjid dan gambar (App Flow §4.6). */
export function ContentPage() {
  const { mosque, canAdmin } = useMosque();
  const qc = useQueryClient();
  const base = `/api/admin/mosques/${mosque.id}`;
  const slidesKey = ["slides", mosque.id];
  const contentKey = ["content", mosque.id, "all"];
  const slidesQ = useQuery({
    queryKey: slidesKey,
    queryFn: () => api<{ slides: Slide[] }>("GET", `${base}/slides`),
  });
  const contentQ = useQuery({
    queryKey: contentKey,
    queryFn: () => api<{ content: ContentItem[] }>("GET", `${base}/content`),
  });
  const libraryQ = useQuery({
    queryKey: ["library", "verified"],
    queryFn: () => api<{ content: ContentItem[] }>("GET", "/api/admin/library?status=verified"),
  });
  const setSlides = (d: { slides: Slide[] }) => qc.setQueryData(slidesKey, d);
  const refreshContent = () => qc.invalidateQueries({ queryKey: ["content", mosque.id] });

  const addSlide = useMutation({
    mutationFn: (contentItemId: string) => api<{ slides: Slide[] }>("POST", `${base}/slides`, { contentItemId }),
    onSuccess: setSlides,
  });
  const patchSlide = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Slide> }) => api<{ slides: Slide[] }>("PATCH", `${base}/slides/${id}`, body),
    onSuccess: setSlides,
  });
  const delSlide = useMutation({
    mutationFn: (id: string) => api<{ slides: Slide[] }>("DELETE", `${base}/slides/${id}`),
    onSuccess: setSlides,
  });
  const order = useMutation({
    mutationFn: (ids: string[]) => api<{ slides: Slide[] }>("PUT", `${base}/slides/order`, { ids }),
    onSuccess: setSlides,
  });
  const delContent = useMutation({
    mutationFn: (id: string) => api("DELETE", `${base}/content/${id}`),
    onSuccess: refreshContent,
  });
  const overviewQ = useQuery({
    queryKey: ["overview", mosque.id],
    queryFn: () => api<Overview>("GET", `${base}/overview`),
  });
  const [picking, setPicking] = useState(false);
  const [editingSlide, setEditingSlide] = useState<string | null>(null);
  const [newInfo, setNewInfo] = useState<InfoType | "image" | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [editingContent, setEditingContent] = useState<string | null>(null);

  if (slidesQ.isPending || contentQ.isPending) return <Loading />;
  if (slidesQ.isError) return <ErrorAlert error={slidesQ.error} />;
  if (contentQ.isError) return <ErrorAlert error={contentQ.error} />;
  const slideList = slidesQ.data.slides;
  const own = contentQ.data.content;
  const materials = own.filter((c) => c.type !== "hadith");
  const candidates: { group: string; items: ContentItem[] }[] = [
    { group: "Info masjid & gambar", items: materials },
    {
      group: "Hadits masjid",
      items: own.filter((c) => c.type === "hadith" && c.status === "published"),
    },
    { group: "Kumpulan hadits SIWAK", items: libraryQ.data?.content ?? [] },
  ];

  const move = (i: number, dir: -1 | 1) => {
    const ids = slideList.map((s) => s.id);
    [ids[i], ids[i + dir]] = [ids[i + dir]!, ids[i]!];
    order.mutate(ids);
  };

  const contentInfo = overviewQ.data?.showing.content;
  const layoutBar = Boolean(contentInfo && (!contentInfo.enabled || (!contentInfo.panel && !contentInfo.fullscreen.enabled)));
  const slideOf = (contentId: string) => slideList.find((s) => s.contentItemId === contentId);

  return (
    <div className="stack">
      {canAdmin ? (
        <ContentDisplaySettings />
      ) : (
        layoutBar && (
          <div className="feature-note" role="status">
            <span>Slide sedang tidak tampil di TV. Minta admin masjid menyalakannya di halaman ini.</span>
          </div>
        )
      )}
      <div className="mosque-wide">
        <section className="stack">
          <div className="page-head" style={{ marginBottom: 0 }}>
            <h2>Urutan slide di TV</h2>
            <button className="btn btn-primary" onClick={() => setPicking(!picking)}>
              {picking ? "Tutup" : "Tambah slide"}
            </button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Slide diputar sesuai urutan ini, bergantian dengan hadits. Slide tidak tampil saat hitung mundur adzan/iqamah, saat shalat, dan saat Jumat.
          </p>
          {picking && (
            <div className="card stack">
              {candidates.map((g) => (
                <div key={g.group} className="stack" style={{ gap: 8 }}>
                  <h3>{g.group}</h3>
                  {g.items.length === 0 ? (
                    <div className="muted small">Belum ada.</div>
                  ) : (
                    g.items.map((c) => (
                      <div key={c.id} className="pick-row">
                        <span className="small">
                          <strong>{c.type === "hadith" ? categoryLabel(c.category) : CONTENT_TYPE_LABEL[c.type]}</strong> · {contentSummary(c).slice(0, 110)}
                        </span>
                        {slideOf(c.id) ? (
                          // Satu konten cukup satu slide; mencegah slide ganda yang membuat TV mengulang isi yang sama.
                          <span className="badge badge-ok">Sudah jadi slide</span>
                        ) : (
                          <button
                            className="btn btn-small"
                            disabled={addSlide.isPending}
                            onClick={() => {
                              addSlide.mutate(c.id);
                              setPicking(false);
                            }}
                          >
                            Jadikan slide
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
          <ErrorAlert error={addSlide.error ?? patchSlide.error ?? delSlide.error ?? order.error} />
          {slideList.length === 0 ? (
            <div className="card empty">Belum ada slide. Tanpa slide, TV tetap memutar hadits otomatis.</div>
          ) : (
            <ol className="list plain">
              {slideList.map((s, i) => (
                <li key={s.id} className="card stack">
                  <div className="slide-row">
                    {s.content?.type === "image" && s.content.mediaId && <img className="slide-thumb" src={mediaUrl(s.content.mediaId)} alt="" />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row-title small">
                        {s.content
                          ? s.content.type === "hadith"
                            ? `Hadits · ${categoryLabel(s.content.category)}`
                            : CONTENT_TYPE_LABEL[s.content.type]
                          : "Konten dihapus"}
                        {!s.enabled && <span className="badge">Disembunyikan</span>}
                      </div>
                      <div className="small">{s.content ? contentSummary(s.content).slice(0, 140) : ""}</div>
                      <div className="muted small">
                        {s.durationSec} detik · {daysText(s.daysMask)}
                        {s.timeFrom ? ` · ${s.timeFrom}–${s.timeTo}` : ""}
                      </div>
                    </div>
                  </div>
                  {editingSlide === s.id ? (
                    <SlideEditor
                      slide={s}
                      busy={patchSlide.isPending}
                      errors={fieldErrors(patchSlide.error)}
                      onSave={(body) => patchSlide.mutate({ id: s.id, body }, { onSuccess: () => setEditingSlide(null) })}
                      onCancel={() => setEditingSlide(null)}
                    />
                  ) : (
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button className="btn btn-small" aria-label="Naikkan" disabled={i === 0 || order.isPending} onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button
                        className="btn btn-small"
                        aria-label="Turunkan"
                        disabled={i === slideList.length - 1 || order.isPending}
                        onClick={() => move(i, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn-small"
                        onClick={() =>
                          patchSlide.mutate({
                            id: s.id,
                            body: { enabled: !s.enabled },
                          })
                        }
                      >
                        {s.enabled ? "Sembunyikan" : "Tampilkan"}
                      </button>
                      <button className="btn btn-small" onClick={() => setEditingSlide(s.id)}>
                        Atur waktu tayang
                      </button>
                      <ConfirmAction
                        small
                        label="Hapus"
                        question="Hapus slide ini? Kontennya tetap tersimpan."
                        confirmLabel="Ya, hapus"
                        onConfirm={() => delSlide.mutate(s.id)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="stack">
          <div className="page-head" style={{ marginBottom: 0 }}>
            <h2>Info masjid & gambar</h2>
            <button className="btn btn-primary" onClick={() => (choosing || newInfo ? (setChoosing(false), setNewInfo(null)) : setChoosing(true))}>
              {choosing || newInfo ? "Tutup" : "Tambah info"}
            </button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Informasi, laporan kas, petugas Jumat, agenda, hari besar, atau gambar. Yang baru dibuat langsung masuk ke urutan slide.
          </p>
          {choosing && !newInfo && (
            <div className="card new-content">
              {NEW_CONTENT.map((n) => (
                <button
                  key={n.type}
                  type="button"
                  className="new-content-item"
                  onClick={() => {
                    setNewInfo(n.type);
                    setChoosing(false);
                  }}
                >
                  <span className="new-content-icon" aria-hidden="true">
                    <Icon name={n.icon} size={22} />
                  </span>
                  <span>
                    <strong>{CONTENT_TYPE_LABEL[n.type]}</strong>
                    <span className="muted small">{n.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {newInfo && (
            <div className="card">
              <MaterialForm
                type={newInfo}
                onDone={(created) => {
                  setNewInfo(null);
                  void refreshContent();
                  if (created) addSlide.mutate(created.id);
                }}
                onCancel={() => setNewInfo(null)}
              />
            </div>
          )}
          {materials.length === 0 ? (
            <div className="card empty">Belum ada info masjid atau gambar.</div>
          ) : (
            <div className="list">
              {materials.map((c) => (
                <div key={c.id} className="card stack">
                  {editingContent === c.id ? (
                    <MaterialForm
                      type={c.type as InfoType | "image"}
                      initial={c}
                      onDone={() => {
                        setEditingContent(null);
                        void refreshContent();
                        void qc.invalidateQueries({ queryKey: slidesKey });
                      }}
                      onCancel={() => setEditingContent(null)}
                    />
                  ) : (
                    <>
                      <div className="slide-row">
                        {c.type === "image" && c.mediaId && <img className="slide-thumb" src={mediaUrl(c.mediaId)} alt="" />}
                        <div>
                          <div className="row-title small">
                            {CONTENT_TYPE_LABEL[c.type]}
                            <SlideState slide={slideOf(c.id)} hiddenByLayout={layoutBar} />
                          </div>
                          <div className="small">{contentSummary(c)}</div>
                        </div>
                      </div>
                      <div className="actions" style={{ marginTop: 0 }}>
                        {!slideOf(c.id) && (
                          <button className="btn btn-small btn-primary" disabled={addSlide.isPending} onClick={() => addSlide.mutate(c.id)}>
                            Tampilkan di TV
                          </button>
                        )}
                        <button className="btn btn-small" onClick={() => setEditingContent(c.id)}>
                          Ubah
                        </button>
                        <ConfirmAction small label="Hapus" question="Hapus konten ini?" confirmLabel="Ya, hapus" onConfirm={() => delContent.mutate(c.id)} />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <ErrorAlert error={delContent.error} />
        </section>
      </div>
    </div>
  );
}

function SlideEditor({
  slide,
  busy,
  errors,
  onSave,
  onCancel,
}: {
  slide: Slide;
  busy: boolean;
  errors: Record<string, string>;
  onSave: (b: Partial<Slide>) => void;
  onCancel: () => void;
}) {
  const [duration, setDuration] = useState(slide.durationSec);
  const [mask, setMask] = useState(slide.daysMask);
  const [timed, setTimed] = useState(Boolean(slide.timeFrom));
  const [from, setFrom] = useState(slide.timeFrom ?? "08:00");
  const [to, setTo] = useState(slide.timeTo ?? "17:00");
  return (
    <div className="stack">
      <Stepper label="Lama tampil" unit="detik" value={duration} min={10} max={60} step={5} onChange={setDuration} />
      <fieldset className="segmented-field">
        <legend>Hari tayang</legend>
        <div className="segmented">
          {DAYS.map((d, i) => (
            <label key={d}>
              <input type="checkbox" checked={Boolean(mask & (1 << i))} onChange={() => setMask(mask ^ (1 << i))} />
              <span>{d}</span>
            </label>
          ))}
        </div>
        {errors.daysMask && <div className="error small">{errors.daysMask}</div>}
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
        <span>Hanya pada jam tertentu</span>
      </label>
      {timed && (
        <div className="grid-2">
          <label className="field">
            <span className="label">Dari</span>
            <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Sampai</span>
            <input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      )}
      <div className="actions">
        <button
          className="btn btn-primary btn-small"
          disabled={busy || mask === 0}
          onClick={() =>
            onSave({
              durationSec: duration,
              daysMask: mask,
              timeFrom: timed ? from : null,
              timeTo: timed ? to : null,
            })
          }
        >
          Simpan
        </button>
        <button className="btn btn-small" onClick={onCancel}>
          Batal
        </button>
      </div>
    </div>
  );
}

// ---- Formulir panel informasi dan gambar ------------------------------------------------

interface AgendaItem {
  day: string;
  time: string;
  title: string;
  speaker: string;
}
const HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Ahad", "Setiap hari"];

/** Status tayang satu konten: jadi slide, disembunyikan, atau belum tampil. */
function SlideState({ slide, hiddenByLayout }: { slide: Slide | undefined; hiddenByLayout: boolean }) {
  if (!slide) return <span className="badge">Belum tampil</span>;
  if (!slide.enabled) return <span className="badge">Disembunyikan</span>;
  if (hiddenByLayout) return <span className="badge">Slide sedang dimatikan</span>;
  return <span className="badge badge-ok">Tampil di TV</span>;
}

function MaterialForm({
  type,
  initial,
  onDone,
  onCancel,
}: {
  type: InfoType | "image";
  initial?: ContentItem;
  onDone: (created?: ContentItem) => void;
  onCancel: () => void;
}) {
  const { mosque } = useMosque();
  const base = `/api/admin/mosques/${mosque.id}/content`;
  const b = (initial?.body ?? {}) as Record<string, unknown>;
  const [kas, setKas] = useState({
    reportDate: String(b.reportDate ?? today()),
    openingBalance: Number(b.openingBalance ?? 0),
    income: Number(b.income ?? 0),
    expense: Number(b.expense ?? 0),
  });
  const [jumat, setJumat] = useState({
    date: String(b.date ?? today()),
    khatib: String(b.khatib ?? ""),
    imam: String(b.imam ?? ""),
    muadzin: String(b.muadzin ?? ""),
    theme: String(b.theme ?? ""),
  });
  const [items, setItems] = useState<AgendaItem[]>((b.items as AgendaItem[]) ?? [{ day: "Selasa", time: "18:15", title: "", speaker: "" }]);
  const [event, setEvent] = useState(String(b.event ?? "ISRA_MIRAJ"));
  const [teks, setTeks] = useState({ title: String(b.title ?? ""), text: String(b.text ?? "") });
  const [mediaId, setMediaId] = useState<string | null>(initial?.mediaId ?? null);
  const [caption, setCaption] = useState(String(b.caption ?? ""));

  const payload = () => {
    switch (type) {
      case "info_kas":
        return { body: kas };
      case "info_jumat":
        return { body: jumat };
      case "info_agenda":
        return { body: { items } };
      case "info_teks":
        return { body: teks };
      case "info_hari_besar":
        return { body: { event } };
      case "image":
        return { mediaId, caption };
    }
  };
  const save = useMutation({
    mutationFn: () =>
      initial ? api<{ content: ContentItem }>("PUT", `${base}/${initial.id}`, payload()) : api<{ content: ContentItem }>("POST", base, { type, ...payload() }),
    onSuccess: (r) => onDone(initial ? undefined : r.content),
  });
  const errors = fieldErrors(save.error);
  const err = (k: string) => errors[k] && <span className="error small">{errors[k]}</span>;
  const money = (k: "openingBalance" | "income" | "expense", label: string) => (
    <label className="field">
      <span className="label">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        className="mono"
        value={kas[k] ? kas[k].toLocaleString("id-ID") : ""}
        placeholder="0"
        onChange={(e) =>
          setKas({
            ...kas,
            [k]: Number(e.target.value.replace(/\D/g, "")) || 0,
          })
        }
      />
      {err(`body.${k}`)}
    </label>
  );

  return (
    <form
      className="stack"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      noValidate
    >
      <h3>{CONTENT_TYPE_LABEL[type]}</h3>
      {type === "info_kas" && (
        <>
          <label className="field">
            <span className="label">Tanggal laporan</span>
            <input type="date" value={kas.reportDate} onChange={(e) => setKas({ ...kas, reportDate: e.target.value })} />
          </label>
          <div className="grid-2">
            {money("openingBalance", "Saldo awal (Rp)")}
            {money("income", "Pemasukan (Rp)")}
            {money("expense", "Pengeluaran (Rp)")}
            <div className="field">
              <span className="label">Saldo akhir</span>
              <div className="mono" style={{ paddingTop: 10 }}>
                {rupiah(kas.openingBalance + kas.income - kas.expense)}
              </div>
            </div>
          </div>
        </>
      )}
      {type === "info_jumat" && (
        <>
          <label className="field">
            <span className="label">Tanggal Jumat</span>
            <input type="date" value={jumat.date} onChange={(e) => setJumat({ ...jumat, date: e.target.value })} />
          </label>
          <div className="grid-2">
            {(["khatib", "imam", "muadzin"] as const).map((k) => (
              <label key={k} className="field">
                <span className="label">{k[0]!.toUpperCase() + k.slice(1)}</span>
                <input type="text" maxLength={80} value={jumat[k]} onChange={(e) => setJumat({ ...jumat, [k]: e.target.value })} />
                {err(`body.${k}`)}
              </label>
            ))}
            <label className="field">
              <span className="label">Tema khutbah (opsional)</span>
              <input type="text" maxLength={120} value={jumat.theme} onChange={(e) => setJumat({ ...jumat, theme: e.target.value })} />
            </label>
          </div>
        </>
      )}
      {type === "info_agenda" && (
        <div className="stack">
          {items.map((it, i) => (
            <div key={i} className="agenda-row">
              <select aria-label="Hari" value={it.day} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))}>
                {HARI.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
              <input
                aria-label="Jam"
                type="time"
                value={it.time}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
              />
              <input
                aria-label="Kegiatan"
                type="text"
                maxLength={80}
                placeholder="Kajian Bulughul Maram"
                value={it.title}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              />
              <input
                aria-label="Pemateri"
                type="text"
                maxLength={60}
                placeholder="Pemateri (opsional)"
                value={it.speaker}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, speaker: e.target.value } : x)))}
              />
              <button type="button" className="btn btn-small" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}>
                Hapus
              </button>
              {(errors[`body.items.${i}.title`] || errors[`body.items.${i}.time`]) && (
                <span className="error small">{errors[`body.items.${i}.title`] ?? errors[`body.items.${i}.time`]}</span>
              )}
            </div>
          ))}
          {items.length < 8 && (
            <div>
              <button type="button" className="btn btn-small" onClick={() => setItems([...items, { day: "Ahad", time: "08:00", title: "", speaker: "" }])}>
                + Kegiatan
              </button>
            </div>
          )}
        </div>
      )}
      {type === "info_teks" && (
        <>
          <label className="field">
            <span className="label">Judul</span>
            <input
              type="text"
              maxLength={80}
              placeholder="Contoh: Parkir kendaraan"
              value={teks.title}
              onChange={(e) => setTeks({ ...teks, title: e.target.value })}
            />
            {err("body.title")}
          </label>
          <label className="field">
            <span className="label">Isi informasi</span>
            <textarea
              rows={5}
              maxLength={400}
              placeholder="Contoh: Jamaah dimohon memarkir kendaraan di halaman belakang selama renovasi."
              value={teks.text}
              onChange={(e) => setTeks({ ...teks, text: e.target.value })}
            />
            <span className="hint">{teks.text.length}/400 karakter. Tulisan pendek lebih mudah dibaca dari jauh.</span>
            {err("body.text")}
          </label>
        </>
      )}
      {type === "info_hari_besar" && (
        <label className="field">
          <span className="label">Hari besar</span>
          <select value={event} onChange={(e) => setEvent(e.target.value)}>
            {HARI_BESAR.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
          <span className="hint">Sisa hari dihitung otomatis di TV dari tanggal Hijriah.</span>
        </label>
      )}
      {type === "image" && (
        <>
          <MediaPicker
            mosqueId={mosque.id}
            kind="image"
            label="Gambar"
            value={mediaId}
            onChange={setMediaId}
            allowNone={false}
            hint="Gambar tampil memenuhi kotak slide. Gambar mendatar (16:9) paling pas."
          />
          {err("mediaId")}
          <label className="field">
            <span className="label">Keterangan (opsional)</span>
            <input type="text" maxLength={120} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </label>
        </>
      )}
      {save.isError && Object.keys(errors).length === 0 && <ErrorAlert error={save.error} />}
      {Object.keys(errors).length > 0 && <div className="alert alert-error small">Periksa isian yang ditandai.</div>}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={save.isPending || (type === "image" && !mediaId)}>
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Batal
        </button>
      </div>
    </form>
  );
}
