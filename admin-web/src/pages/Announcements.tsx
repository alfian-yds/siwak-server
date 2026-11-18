import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Announcement, type Device, api } from "../api";
import { Segmented } from "../components/controls";
import { ConfirmAction, ErrorAlert, Field, Loading, fieldErrors } from "../components/ui";
import { useMosque } from "../mosque";
import { when } from "./MosqueTv";

const MAX = 200;
type Duration = "30m" | "1h" | "2h" | "today" | "custom";
const durations: { value: Duration; label: string }[] = [
  { value: "30m", label: "30 menit" },
  { value: "1h", label: "1 jam" },
  { value: "2h", label: "2 jam" },
  { value: "today", label: "Hari ini" },
  { value: "custom", label: "Pilih sendiri" },
];

/** Nilai awal untuk <input type="datetime-local">: 3 jam dari sekarang, waktu lokal peramban. */
function localInput(offsetMin: number): string {
  const d = new Date(Date.now() + offsetMin * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Pengumuman segera (App Flow §4.7). */
export function AnnouncementsPage() {
  const { mosque } = useMosque();
  const key = ["announcements", mosque.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<{ active: Announcement[]; recent: Announcement[] }>("GET", `/api/admin/mosques/${mosque.id}/announcements`),
    refetchInterval: 30_000,
  });

  return (
    <div className="stack">
      <SendForm />
      <section className="stack">
        <h2>Sedang tayang</h2>
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorAlert error={q.error} />
        ) : q.data.active.length === 0 ? (
          <div className="card empty">Tidak ada pengumuman yang sedang tayang.</div>
        ) : (
          <div className="list">
            {q.data.active.map((a) => (
              <ActiveItem key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>
      {q.data && q.data.recent.length > 0 && (
        <section className="stack">
          <h2>Selesai dalam 7 hari terakhir</h2>
          <div className="list">
            {q.data.recent.map((a) => (
              <div key={a.id} className="card stack ann-item ann-done">
                <div className="ann-text">{a.text}</div>
                <div className="muted small">
                  {a.deviceName ?? "Semua TV"} · {a.revokedAt ? `dicabut ${when(a.revokedAt)}` : `selesai ${when(a.expiresAt)}`}
                  {a.createdBy && ` · dikirim ${a.createdBy}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SendForm() {
  const { mosque } = useMosque();
  const qc = useQueryClient();
  const devices = useQuery({
    queryKey: ["devices", mosque.id],
    queryFn: () => api<{ devices: Device[] }>("GET", `/api/admin/mosques/${mosque.id}/devices`),
  });
  const [text, setText] = useState("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [duration, setDuration] = useState<Duration>("1h");
  const [custom, setCustom] = useState(() => localInput(180));
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: () =>
      api("POST", `/api/admin/mosques/${mosque.id}/announcements`, {
        text,
        deviceId: deviceId || null,
        ...(duration === "custom" ? { expiresAt: new Date(custom).toISOString() } : { duration }),
      }),
    onSuccess: () => {
      setText("");
      setSent(true);
      void qc.invalidateQueries({ queryKey: ["announcements", mosque.id] });
      void qc.invalidateQueries({ queryKey: ["devices", mosque.id] });
    },
  });
  const errors = fieldErrors(send.error);
  const left = MAX - text.length;
  const list = devices.data?.devices ?? [];

  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <h2>Kirim pengumuman</h2>
      <Field label="Isi pengumuman" hint={`${left} karakter tersisa. Tampil sebagai banner di atas layar TV.`} error={errors.text}>
        {(p) => (
          <textarea
            {...p}
            rows={3}
            maxLength={MAX}
            value={text}
            placeholder="Contoh: Mohon kendaraan B 1234 XY dipindahkan, menghalangi pintu keluar."
            onChange={(e) => {
              setText(e.target.value);
              setSent(false);
            }}
          />
        )}
      </Field>
      <Field label="Tampil di" error={errors.deviceId}>
        {(p) => (
          <select {...p} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Semua TV masjid ini</option>
            {list.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Segmented label="Masa tayang" value={duration} options={durations} onChange={setDuration} hint={duration === "today" ? "Sampai pukul 24.00 waktu masjid." : undefined} />
      {duration === "custom" && (
        <Field label="Tayang sampai" error={errors.expiresAt} hint="Paling lama 30 hari.">
          {(p) => <input {...p} type="datetime-local" value={custom} min={localInput(1)} onChange={(e) => setCustom(e.target.value)} />}
        </Field>
      )}
      {!errors.expiresAt && errors.duration && <div className="error small">{errors.duration}</div>}
      {errors.expiresAt && duration !== "custom" && <div className="error small">{errors.expiresAt}</div>}
      <ErrorAlert error={Object.keys(errors).length ? null : send.error} />
      {sent && (
        <div className="alert alert-ok" role="status">
          Terkirim. TV akan menampilkannya dalam 1 menit.
        </div>
      )}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={send.isPending || !text.trim()}>
          {send.isPending ? "Mengirim…" : "Kirim pengumuman"}
        </button>
      </div>
    </form>
  );
}

function ActiveItem({ a }: { a: Announcement }) {
  const { mosque } = useMosque();
  const qc = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => api("POST", `/api/admin/announcements/${a.id}/revoke`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["announcements", mosque.id] }),
  });
  return (
    <div className="card stack ann-item">
      <div className="ann-text">{a.text}</div>
      <div className="muted small">
        {a.deviceName ?? "Semua TV"} · sampai {when(a.expiresAt)}
        {a.createdBy && ` · dikirim ${a.createdBy}`}
      </div>
      <ConfirmAction label="Cabut" question="Cabut pengumuman ini? Banner hilang dari TV dalam 1 menit." confirmLabel="Ya, cabut" busy={revoke.isPending} onConfirm={() => revoke.mutate()} />
      <ErrorAlert error={revoke.error} />
    </div>
  );
}
