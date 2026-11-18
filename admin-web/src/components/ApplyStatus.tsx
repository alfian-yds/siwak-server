import { friendlyTvError, isNetworkError } from "../labels";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type Device, api } from "../api";

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Daftar TV masjid yang dipakai bersama halaman TV dan status penerapan. Dicek tiap 3 detik selama ada
 * TV online yang belum menerapkan perubahan terbaru, selebihnya tiap 20 detik.
 */
export function useMosqueDevices(mosqueId: string) {
  return useQuery({
    queryKey: ["devices", mosqueId],
    queryFn: () => api<{ devices: Device[]; configVersion: number }>("GET", `/api/admin/mosques/${mosqueId}/devices`),
    refetchInterval: (q) => {
      const list = q.state.data?.devices ?? [];
      const busy = list.some((d) => (d.online && d.tokenDelivered && !d.synced) || d.commands.some((c) => c.status === "pending" || c.status === "delivered"));
      return busy ? 3000 : 20000;
    },
  });
}

type Flash = { names: string[]; at: string | null };

/**
 * Memberi tahu pengurus apakah perubahan yang disimpan sudah benar-benar berjalan di TV, bukan sekadar
 * tersimpan di server: menunggu TV → diterapkan di TV (jam) → atau gagal beserta pesan dari TV.
 */
export function ApplyStatus({ mosqueId }: { mosqueId: string }) {
  const q = useMosqueDevices(mosqueId);
  const tvs = (q.data?.devices ?? []).filter((d) => d.tokenDelivered);
  const pending = tvs.filter((d) => d.online && !d.synced);
  const offline = tvs.filter((d) => !d.online && !d.synced);
  // Galat koneksi tidak ditampilkan sebagai kegagalan: TV mencoba lagi sendiri (status online/offline sudah tampil).
  const failing = tvs.filter((d) => d.lastError && !isNetworkError(d.lastError));
  const watching = useRef<Set<string>>(new Set());
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const now = new Set(pending.map((d) => d.id));
    const finished = [...watching.current].filter((id) => !now.has(id));
    const done = tvs.filter((d) => finished.includes(d.id) && d.synced);
    if (done.length) {
      const latest = done.map((d) => d.configAppliedAt).filter(Boolean).sort().pop() ?? null;
      setFlash({ names: done.map((d) => d.name), at: latest });
    }
    watching.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 20_000);
    return () => clearTimeout(t);
  }, [flash]);

  if (!tvs.length) return null;
  const names = (list: Device[]) => list.map((d) => d.name).join(", ");
  const rows: { tone: "busy" | "ok" | "warn" | "bad"; text: string; key: string }[] = [];
  if (pending.length) rows.push({ key: "pending", tone: "busy", text: `Menerapkan perubahan ke TV ${names(pending)}. Menunggu TV mengambilnya, paling lama 1 menit…` });
  if (failing.length)
    for (const d of failing) rows.push({ key: `err-${d.id}`, tone: "bad", text: `TV ${d.name}: ${friendlyTvError(d.lastError)}` });
  if (offline.length) rows.push({ key: "offline", tone: "warn", text: `TV ${names(offline)} sedang offline. Perubahan diterapkan otomatis saat TV online lagi.` });
  if (flash && !pending.length)
    rows.push({ key: "ok", tone: "ok", text: `Perubahan sudah berjalan di TV ${flash.names.join(", ")}${flash.at ? ` (${timeFmt.format(new Date(flash.at))})` : ""}.` });
  if (!rows.length) return null;

  return (
    <div className="apply-status" role="status" aria-live="polite">
      {rows.map((r) => (
        <div key={r.key} className={`apply-row apply-${r.tone}`}>
          <span className="apply-icon" aria-hidden="true">
            {r.tone === "busy" ? <span className="spinner" /> : r.tone === "ok" ? "✓" : "!"}
          </span>
          <span>{r.text}</span>
          {r.tone === "ok" && (
            <button type="button" className="apply-close" aria-label="Tutup" onClick={() => setFlash(null)}>
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Ringkas untuk satu TV (dipakai di kartu TV). */
export function applyText(d: Device): { tone: "ok" | "busy" | "warn" | "bad"; text: string } | null {
  if (!d.tokenDelivered) return null;
  if (d.lastError && !isNetworkError(d.lastError)) return { tone: "bad", text: friendlyTvError(d.lastError) };
  if (!d.synced) return d.online ? { tone: "busy", text: "Menerapkan pengaturan terbaru…" } : { tone: "warn", text: "Pengaturan terbaru diterapkan saat TV online lagi" };
  return { tone: "ok", text: d.configAppliedAt ? `Pengaturan terbaru berjalan sejak ${timeFmt.format(new Date(d.configAppliedAt))}` : "Pengaturan terbaru sudah berjalan" };
}
