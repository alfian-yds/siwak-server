import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { type DashboardDevice, type DashboardSummary, api } from "../api";
import { DeviceEvents } from "../components/DeviceEvents";
import { ErrorAlert, Loading, PageHead } from "../components/ui";
import { deviceState, when } from "./MosqueTv";

type Filter = "all" | "problem";

/** Dasbor semua TV (tugas 3.2): status, selisih jam, dan riwayat kejadian lintas masjid. */
export function DashboardPage() {
  const q = useQuery({
    queryKey: ["all-devices"],
    queryFn: () => api<{ devices: DashboardDevice[]; summary: DashboardSummary; driftWarnSec: number }>("GET", "/api/admin/devices"),
    refetchInterval: 30_000,
  });
  const [filter, setFilter] = useState<Filter>("all");

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorAlert error={q.error} />;
  const { devices, summary, driftWarnSec } = q.data;
  const drifted = (d: DashboardDevice) => d.online && Math.abs(d.clockDriftSec ?? 0) > driftWarnSec;
  const problem = (d: DashboardDevice) => !d.online || d.app.foreground === false || drifted(d) || !d.tokenDelivered;
  const shown = filter === "problem" ? devices.filter(problem) : devices;

  // Kelompokkan per masjid, urutan dari server (nama masjid, nama TV).
  const groups: { id: string; name: string; items: DashboardDevice[] }[] = [];
  for (const d of shown) {
    const last = groups[groups.length - 1];
    if (last?.id === d.mosque.id) last.items.push(d);
    else groups.push({ id: d.mosque.id, name: d.mosque.name, items: [d] });
  }

  return (
    <div className="stack">
      <PageHead title="Semua TV" />
      <p className="muted" style={{ margin: 0 }}>
        Diperbarui otomatis tiap 30 detik. TV dianggap offline bila tidak ada kabar dari TV selama 5 menit.
      </p>
      <div className="stats stats-4">
        <div className="stat card">
          <div className="num">{summary.total}</div>
          <div className="muted small">TV terhubung</div>
        </div>
        <div className="stat card stat-ok">
          <div className="num">{summary.online}</div>
          <div className="muted small">Online</div>
        </div>
        <div className={`stat card${summary.offline ? " stat-bad" : ""}`}>
          <div className="num">{summary.offline}</div>
          <div className="muted small">Offline</div>
        </div>
        <div className={`stat card${summary.background + summary.clockDrift ? " stat-warn" : ""}`}>
          <div className="num">{summary.background + summary.clockDrift}</div>
          <div className="muted small">Perlu dicek (tertutup aplikasi lain / jam)</div>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="Saring TV">
        {(
          [
            ["all", `Semua (${devices.length})`],
            ["problem", `Bermasalah (${devices.filter(problem).length})`],
          ] as [Filter, string][]
        ).map(([v, label]) => (
          <label key={v}>
            <input type="radio" name="tv-filter" checked={filter === v} onChange={() => setFilter(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {devices.length === 0 ? (
        <div className="card empty">Belum ada TV yang terhubung. Buka halaman masjid lalu tekan Hubungkan TV.</div>
      ) : shown.length === 0 ? (
        <div className="card empty">Semua TV dalam keadaan baik.</div>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="stack">
            <div className="page-head" style={{ marginBottom: 0 }}>
              <h2>{g.name}</h2>
              <Link className="btn btn-small" to={`/m/${g.id}`}>
                Buka masjid
              </Link>
            </div>
            <div className="list">
              {g.items.map((d) => (
                <DashboardRow key={d.id} d={d} drifted={drifted(d)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function DashboardRow({ d, drifted }: { d: DashboardDevice; drifted: boolean }) {
  const [open, setOpen] = useState(false);
  const state = deviceState({ ...d, commands: [] });
  const driftMin = Math.max(1, Math.round(Math.abs(d.clockDriftSec ?? 0) / 60));
  return (
    <div className="card stack tv-card">
      <div className="tv-head">
        <div>
          <div className="row-title">{d.name}</div>
          <div className={`status status-${state.tone}`}>
            <span className="dot" aria-hidden="true" />
            {state.text}
          </div>
          <div className="muted small">
            Terakhir menghubungi {when(d.lastSeenAt)} · versi {d.appVersion ?? "—"}
            {d.online && !d.synced && " · menunggu pengaturan terbaru"}
          </div>
        </div>
        <button type="button" className="btn btn-small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Tutup" : "Riwayat"}
        </button>
      </div>
      {drifted && <div className="alert alert-warn small">Jam TV selisih {driftMin} menit. Periksa pengaturan waktu TV.</div>}
      {open && (
        <div className="tv-details">
          <DeviceEvents deviceId={d.id} />
        </div>
      )}
    </div>
  );
}
