import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type CommandType, type Device, type DeviceCommand, type Overview, type Settings, api } from "../api";
import { applyText, useMosqueDevices } from "../components/ApplyStatus";
import { DeviceEvents } from "../components/DeviceEvents";
import { ConfirmAction, ErrorAlert, Loading } from "../components/ui";
import { useMosque } from "../mosque";
import { fmtMin, hijriText, scheduleFor, wallClock } from "../prayer";

const timeFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
/** "09.12" bila hari ini, "16 Nov 09.12" bila hari lain. */
export function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? timeFmt.format(d) : dayFmt.format(d);
}

/** Status TV dengan titik warna dan teks (Design Brief §9, TRD §7.4). */
export function deviceState(d: Device): {
  tone: "ok" | "warn" | "bad" | "idle";
  text: string;
} {
  if (!d.tokenDelivered) return { tone: "idle", text: "Menunggu TV menyelesaikan penyambungan" };
  if (!d.online)
    return {
      tone: "bad",
      text: d.lastSeenAt ? `Offline sejak ${when(d.lastSeenAt)}` : "Belum pernah terhubung",
    };
  if (d.app.foreground === false)
    return {
      tone: "warn",
      text: `Online · SIWAK tertutup aplikasi lain sejak ${when(d.app.since)}`,
    };
  if (d.app.foreground === true) return { tone: "ok", text: "Online · SIWAK tampil" };
  return { tone: "ok", text: "Online" };
}

const commandLabel: Record<CommandType, string> = {
  open_app: "Buka SIWAK",
  sync_now: "Perbarui data TV",
  restart_app: "Mulai ulang SIWAK",
  show_mutiara: "Tampilkan slide layar penuh",
};

function commandText(c: DeviceCommand): {
  text: string;
  tone: "muted" | "ok" | "bad";
} {
  switch (c.status) {
    case "pending":
      return { text: "Menunggu TV (paling lama 1 menit)…", tone: "muted" };
    case "delivered":
      return { text: "Diterima TV, sedang dijalankan…", tone: "muted" };
    case "done":
      return { text: `Berhasil · ${when(c.finishedAt)}`, tone: "ok" };
    case "failed":
      return { text: `Gagal: ${c.result ?? "tanpa keterangan"}`, tone: "bad" };
    case "expired":
      return { text: "Tidak dijawab TV dalam 10 menit.", tone: "bad" };
  }
}

export function MosqueTvPage() {
  const { mosque, canAdmin } = useMosque();
  const q = useMosqueDevices(mosque.id);

  return (
    <div className="stack">
      <TodayPanel />
      <div className="mosque-wide">
        <OverviewPanel />
        <div className="stack">
          <div className="page-head" id="tv-list" style={{ marginBottom: 0 }}>
            <h2>TV di masjid ini</h2>
            <div className="actions" style={{ marginTop: 0 }}>
              <Link className="btn btn-primary" to={`/m/${mosque.id}/pengumuman`}>
                Kirim pengumuman
              </Link>
              {canAdmin && (
                <Link className="btn" to={`/m/${mosque.id}/hubungkan`}>
                  Hubungkan TV
                </Link>
              )}
            </div>
          </div>
          {q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <ErrorAlert error={q.error} />
          ) : q.data.devices.length === 0 ? (
            <div className="card empty">
              Belum ada TV di masjid ini.
              {canAdmin && " Tekan Hubungkan TV untuk memulai."}
            </div>
          ) : (
            <div className="list plain">
              {q.data.devices.map((d) => (
                <DeviceCard key={d.id} device={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ringkasan: masalah beserta perbaikannya, langkah awal, dan apa yang sedang tampil di TV. */
function OverviewPanel() {
  const { mosque, canAdmin } = useMosque();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const base = `/m/${mosque.id}`;
  const q = useQuery({
    queryKey: ["overview", mosque.id],
    queryFn: () => api<Overview>("GET", `/api/admin/mosques/${mosque.id}/overview`),
    refetchInterval: 30_000,
  });
  const enableContent = useMutation({
    mutationFn: async () => {
      const { settings } = await api<{ settings: Settings }>("GET", `/api/admin/mosques/${mosque.id}/settings`);
      settings.display.content.enabled = true;
      // Tanpa cara tampil, slide tidak terlihat: mulai dengan tampil di samping jam.
      if (settings.display.layout !== "GALERI" && !settings.display.mutiaraHadits.enabled) settings.display.layout = "GALERI";
      return api("PUT", `/api/admin/mosques/${mosque.id}/settings`, {
        settings,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["settings", mosque.id] }),
  });
  const openApp = useMutation({
    mutationFn: (deviceId: string) =>
      api("POST", `/api/admin/devices/${deviceId}/commands`, {
        type: "open_app",
      }),
  });

  if (!q.data) return q.isError ? <ErrorAlert error={q.error} /> : null;
  const o = q.data;
  const actionButton = (action: string | undefined, deviceId?: string) => {
    switch (action) {
      case "connect_tv":
        return (
          <Link className="btn btn-small" to={`${base}/hubungkan`}>
            Hubungkan TV
          </Link>
        );
      case "enable_content":
        return (
          <button className="btn btn-small btn-primary" disabled={enableContent.isPending} onClick={() => enableContent.mutate()}>
            {enableContent.isPending ? "Menyalakan…" : "Nyalakan slide & hadits"}
          </button>
        );
      case "open_content":
        return (
          <Link className="btn btn-small" to={`${base}/konten`}>
            Tambah konten
          </Link>
        );
      case "open_app":
        return deviceId ? (
          <button className="btn btn-small btn-primary" disabled={openApp.isPending} onClick={() => openApp.mutate(deviceId)}>
            {openApp.isSuccess ? "Perintah terkirim" : "Buka SIWAK di TV"}
          </button>
        ) : null;
      case "open_schedule":
        return (
          <Link className="btn btn-small" to={`${base}/jadwal`}>
            Buka Jadwal
          </Link>
        );
      case "open_hadith":
        return (
          <Link className="btn btn-small" to={`${base}/hadits`}>
            Atur hadits
          </Link>
        );
      case "open_display":
        return (
          <Link className="btn btn-small" to={`${base}/tampilan`}>
            Buka Tampilan
          </Link>
        );
      case "open_library":
        return (
          <Link className="btn btn-small" to="/pustaka">
            Buka kumpulan hadits
          </Link>
        );
      case "open_tv":
        return (
          <button className="btn btn-small" onClick={() => document.getElementById("tv-list")?.scrollIntoView({ behavior: "smooth" })}>
            Lihat detail TV
          </button>
        );
      default:
        return null;
    }
  };
  const steps = [
    {
      done: o.checklist.tvConnected,
      label: "Hubungkan TV",
      to: `${base}/hubungkan`,
      admin: true,
    },
    {
      done: o.checklist.scheduleChecked,
      label: "Periksa lokasi dan jadwal, atur koreksi menit",
      to: `${base}/jadwal`,
      admin: true,
    },
    {
      done: o.checklist.runningText,
      label: "Tambahkan teks berjalan",
      to: `${base}/teks`,
      admin: false,
    },
    ...(o.showing.content.enabled
      ? [
          {
            done: o.checklist.slides,
            label: "Tambahkan slide (info masjid atau gambar)",
            to: `${base}/konten`,
            admin: false,
          },
        ]
      : []),
  ].filter((st) => canAdmin || !st.admin);
  const allDone = steps.every((st) => st.done);
  const c = o.showing.content;

  return (
    <div className="stack">
      {o.issues.length > 0 && (
        <section className="stack issues" aria-label="Perlu perhatian">
          {o.issues.map((i, n) => (
            <div key={`${i.code}-${n}`} className={`issue issue-${i.level}`}>
              <span>{i.message}</span>
              {actionButton(i.action, i.deviceId)}
            </div>
          ))}
          <ErrorAlert error={enableContent.error ?? openApp.error} />
        </section>
      )}

      {!allDone && (
        <section className="card stack">
          <h2>Langkah awal</h2>
          <ol className="checklist">
            {steps.map((st) => (
              <li key={st.label} className={st.done ? "done" : ""}>
                <span className="check" aria-hidden="true">
                  {st.done ? "✓" : ""}
                </span>
                {st.done ? <span>{st.label}</span> : <Link to={st.to}>{st.label}</Link>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="stack">
        <h2>Yang tampil di TV sekarang</h2>
        <div className="showing">
          <button type="button" className="card show-item" onClick={() => navigate(`${base}/konten`)}>
            <span className="muted small">Slide & hadits</span>
            <strong>
              {c.enabled
                ? c.panel && c.fullscreen.enabled
                  ? "Di samping jam + layar penuh"
                  : c.panel
                    ? "Di samping jam"
                    : c.fullscreen.enabled
                      ? "Sesekali layar penuh"
                      : "Belum dipilih"
                : "Mati (jam & jadwal saja)"}
            </strong>
          </button>
          <button type="button" className="card show-item" onClick={() => navigate(`${base}/pengumuman`)}>
            <span className="muted small">Pengumuman aktif</span>
            <strong className="mono-num">{o.showing.announcements}</strong>
          </button>
          <button type="button" className="card show-item" onClick={() => navigate(`${base}/teks`)}>
            <span className="muted small">Teks berjalan</span>
            <strong className="mono-num">{o.showing.runningTexts}</strong>
          </button>
          {c.enabled && (
            <div className="card show-item">
              <span className="muted small">Yang diputar</span>
              <strong className="mono-num">{c.items}</strong>
              <span className="muted small">
                {o.showing.slides} slide, {c.hadiths} hadits
              </span>
              {c.fullscreen.enabled && (
                <span className="muted small">
                  layar penuh setiap {c.fullscreen.everyMinutes} menit selama {c.fullscreen.showSeconds} detik
                </span>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DeviceCard({ device: d }: { device: Device }) {
  const { mosque, canAdmin } = useMosque();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["devices", mosque.id] });
  const state = deviceState(d);
  const [open, setOpen] = useState(false);

  const send = useMutation({
    mutationFn: (type: CommandType) => api("POST", `/api/admin/devices/${d.id}/commands`, { type }),
    onSuccess: refresh,
  });
  const active = (t: CommandType) => d.commands.find((c) => c.type === t && (c.status === "pending" || c.status === "delivered"));
  const drift = d.clockDriftSec !== null && Math.abs(d.clockDriftSec) > 60 ? Math.round(Math.abs(d.clockDriftSec) / 60) : 0;
  const apply = applyText(d);

  return (
    <div className="card stack tv-card">
      <div className="tv-head">
        <div>
          <div className="row-title">{d.name}</div>
          <div className="muted small">
            {[d.model, d.appVersion ? `SIWAK ${d.appVersion}` : null, d.lastSeenAt ? `kontak terakhir ${when(d.lastSeenAt)}` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <button type="button" className="btn btn-small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Tutup" : "Kelola"}
        </button>
      </div>

      {/* Status besar agar langsung terlihat apakah TV benar-benar online. */}
      <div className={`tv-status tv-status-${state.tone}`} role="status">
        <span className="tv-status-dot" aria-hidden="true" />
        <div>
          <strong>{{ ok: "ONLINE", warn: "PERLU DICEK", bad: "OFFLINE", idle: "MENUNGGU" }[state.tone]}</strong>
          <span>{state.text.replace(/^Online · /, "")}</span>
        </div>
      </div>

      {drift > 0 && <div className="alert alert-warn small">Jam TV selisih {drift} menit. Periksa pengaturan waktu TV.</div>}
      {apply && (
        <div className={`small apply-inline apply-${apply.tone}`}>
          {apply.tone === "ok" ? "✓ " : apply.tone === "busy" ? "… " : "! "}
          {apply.text}
        </div>
      )}

      {d.tokenDelivered && (
        <div className="stack" style={{ gap: 8 }}>
          {state.tone === "warn" && d.app.canOpenApp === false && (
            <div className="alert alert-warn small">
              Di TV ini SIWAK belum boleh membuka dirinya sendiri. Di TV: Setelan → Aplikasi → SIWAK → Tampil di atas aplikasi lain → Izinkan.
            </div>
          )}
          {!d.online && (
            <div className="muted small">TV mati, internet putus, atau aplikasi dihentikan. Perintah baru sampai saat TV online lagi (maks. 10 menit).</div>
          )}
          <div className="tv-commands">
            {(["open_app", "show_mutiara", "sync_now", "restart_app"] as CommandType[])
              .filter((t) => t === "open_app" || t === "show_mutiara" || canAdmin)
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  className={t === "open_app" && state.tone === "warn" ? "btn btn-primary" : "btn"}
                  disabled={Boolean(active(t)) || send.isPending}
                  onClick={() => send.mutate(t)}
                >
                  {commandLabel[t]}
                </button>
              ))}
          </div>
          {d.commands.map((c) => {
            const s = commandText(c);
            return (
              <div key={c.id} className={`small cmd cmd-${s.tone}`}>
                <strong>{commandLabel[c.type]}:</strong> {s.text}
              </div>
            );
          })}
          <ErrorAlert error={send.error} />
        </div>
      )}

      {open && (
        <div className="stack tv-details">
          <dl className="facts small">
            <dt>Model</dt>
            <dd>{d.model ?? "—"}</dd>
            <dt>Versi aplikasi</dt>
            <dd className="mono">{d.appVersion ?? "—"}</dd>
            <dt>Terakhir menghubungi</dt>
            <dd>{when(d.lastSeenAt)}</dd>
            <dt>Terhubung sejak</dt>
            <dd>{when(d.pairedAt)}</dd>
          </dl>
          <section className="stack">
            <h3>Riwayat kejadian</h3>
            <DeviceEvents deviceId={d.id} />
          </section>
          {canAdmin && (
            <>
              <RenameDevice device={d} onDone={refresh} />
              <section className="stack">
                <h3>Putuskan TV</h3>
                <ConfirmAction
                  label="Putuskan TV"
                  question={`Putuskan ${d.name} dari website? TV kembali ke mode mandiri dengan pengaturan terakhir.`}
                  confirmLabel="Ya, putuskan"
                  onConfirm={() => void api("POST", `/api/admin/devices/${d.id}/unpair`).then(refresh)}
                />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RenameDevice({ device, onDone }: { device: Device; onDone: () => void }) {
  const [name, setName] = useState(device.name);
  const m = useMutation({
    mutationFn: () => api("PATCH", `/api/admin/devices/${device.id}`, { name }),
    onSuccess: onDone,
  });
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="field">
        <span className="label">Nama TV</span>
        <div className="inline-form">
          <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-small" type="submit" disabled={m.isPending || name.trim() === device.name || !name.trim()}>
            Simpan nama
          </button>
        </div>
      </label>
      <ErrorAlert error={m.error} />
    </form>
  );
}

// ---- Ringkasan hari ini (pemantauan) -------------------------------------------------------

interface TodayBundle {
  mosque: { latitude: number; longitude: number; timezone: string };
  settings: Settings;
  weather: { temperatureC: number; description: string; humidity: number } | null;
}

const PRAYER_LABEL: Record<string, string> = {
  imsak: "Imsak",
  subuh: "Subuh",
  terbit: "Terbit",
  dzuhur: "Dzuhur",
  ashar: "Ashar",
  maghrib: "Maghrib",
  isya: "Isya",
};

/**
 * Bagian atas Beranda: waktu shalat berikutnya (hitung mundur), tanggal, cuaca, keadaan TV, dan jadwal
 * hari ini. Jam shalat dihitung di peramban dengan cara yang sama dengan Pratinjau (perkiraan ±1 menit).
 */
function TodayPanel() {
  const { mosque } = useMosque();
  const q = useQuery({
    queryKey: ["preview", mosque.id],
    queryFn: () => api<TodayBundle>("GET", `/api/admin/mosques/${mosque.id}/preview`),
    refetchInterval: 60_000,
  });
  const ov = useQuery({
    queryKey: ["overview", mosque.id],
    queryFn: () => api<Overview>("GET", `/api/admin/mosques/${mosque.id}/overview`),
    refetchInterval: 30_000,
  });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!q.data) return q.isError ? <ErrorAlert error={q.error} /> : null;
  const b = q.data;
  const s = b.settings;
  const tz = b.mosque.timezone || "Asia/Jakarta";
  const wc = wallClock(tz, now);
  const times = scheduleFor(s.schedule, b.mosque.latitude, b.mosque.longitude, tz, wc.y, wc.m, wc.d);
  const use24h = s.display.clock.use24h;
  const adzan = ["subuh", "dzuhur", "ashar", "maghrib", "isya"] as const;
  const nextKey = adzan.find((k) => times[k] > wc.minutes) ?? "subuh";
  const isFriday = new Date(Date.UTC(wc.y, wc.m - 1, wc.d)).getUTCDay() === 5;
  const label = (k: string) => (k === "dzuhur" && isFriday ? "Jumat" : PRAYER_LABEL[k]!);
  const left = (((times[nextKey] - wc.minutes) % 1440) + 1440) % 1440;
  const remaining = left >= 60 ? `${Math.floor(left / 60)} jam ${left % 60} menit lagi` : `${left} menit lagi`;
  const keys = (["imsak", "subuh", "terbit", "dzuhur", "ashar", "maghrib", "isya"] as const).filter(
    (k) => (k !== "imsak" || s.schedule.showImsak) && (k !== "terbit" || s.schedule.showTerbit),
  );
  const dateText = new Intl.DateTimeFormat("id-ID", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const tvs = ov.data?.tvs;
  const tvTone = !tvs || tvs.total === 0 ? "idle" : tvs.online === tvs.total && tvs.failing === 0 ? "ok" : tvs.online === 0 ? "bad" : "warn";
  const weather = s.display.showWeather ? b.weather : null;

  return (
    <section className="card today">
      <div className="today-stats">
        <div className="today-next">
          <span className="muted small">Waktu shalat berikutnya</span>
          <strong>
            {label(nextKey)} <span className="mono-num">{fmtMin(times[nextKey], use24h)}</span>
          </strong>
          <span className="small">{remaining}</span>
        </div>
        <div>
          <span className="muted small">Hari ini</span>
          <b>{dateText}</b>
          <span className="small">{hijriText(s.schedule.hijri, now, tz)}</span>
        </div>
        <div>
          <span className="muted small">TV masjid</span>
          <b className={`status status-${tvTone}`}>
            <span className="dot" aria-hidden="true" />
            {!tvs ? "…" : tvs.total === 0 ? "Belum ada TV" : `${tvs.online} dari ${tvs.total} online`}
          </b>
          <span className="small">
            {!tvs || tvs.total === 0
              ? "Hubungkan TV untuk mulai memantau."
              : tvs.failing > 0
                ? `${tvs.failing} TV melaporkan masalah`
                : tvs.pendingApply > 0
                  ? `${tvs.pendingApply} TV belum menerima perubahan terbaru`
                  : "Pengaturan terbaru sudah berjalan"}
          </span>
        </div>
        {weather && (
          <div>
            <span className="muted small">Cuaca di masjid</span>
            <b>{Math.round(weather.temperatureC)}°C</b>
            <span className="small" style={{ textTransform: "capitalize" }}>
              {weather.description} · lembap {weather.humidity}%
            </span>
          </div>
        )}
      </div>
      <div className="today-times" aria-label="Jadwal shalat hari ini">
        {keys.map((k) => {
          const isAdzan = (adzan as readonly string[]).includes(k);
          const gap = isAdzan ? s.prayerCycle.iqamahGapMinutes[k as (typeof adzan)[number]] : null;
          return (
            <div key={k} className={k === nextKey ? "on" : times[k] <= wc.minutes ? "past" : ""}>
              <span>{label(k)}</span>
              <b className="mono-num">{fmtMin(times[k], use24h)}</b>
              {gap !== null && <small>Iqamah {fmtMin(times[k] + gap, use24h)}</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
