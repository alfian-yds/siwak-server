import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { type MediaItem, api, mediaUrl, upload } from "../api";
import { ErrorAlert } from "./ui";

const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtDur = (ms: number | null) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}` : "");

/**
 * Memilih media milik masjid atau mengunggah yang baru (TRD §9).
 * Gambar diubah server menjadi WebP; audio dicek jenis dan durasinya.
 */
export function MediaPicker({
  mosqueId,
  kind,
  label,
  hint,
  value,
  onChange,
  allowNone = true,
}: {
  mosqueId: string;
  kind: "image" | "audio";
  label: string;
  hint?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
}) {
  const qc = useQueryClient();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const key = ["media", mosqueId, kind];
  const list = useQuery({
    queryKey: key,
    enabled: open || Boolean(value),
    queryFn: () => api<{ media: MediaItem[] }>("GET", `/api/admin/mosques/${mosqueId}/media?kind=${kind}`),
  });
  const send = useMutation({
    mutationFn: (file: File) => upload<{ media: MediaItem }>(`/api/admin/mosques/${mosqueId}/media?kind=${kind}`, file),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: key });
      onChange(r.media.id);
      setOpen(false);
    },
  });
  const current = list.data?.media.find((m) => m.id === value);

  return (
    <div className="field media-picker">
      <span className="label">{label}</span>
      <div className="media-current">
        {value ? (
          kind === "image" ? (
            <img src={mediaUrl(value)} alt="" className="media-thumb" />
          ) : (
            <audio controls preload="none" src={mediaUrl(value)} />
          )
        ) : (
          <span className="muted small">Belum dipilih{kind === "image" ? " (memakai bawaan)" : ""}</span>
        )}
        <div className="actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-small" onClick={() => setOpen(!open)}>
            {open ? "Tutup" : value ? "Ganti" : "Pilih atau unggah"}
          </button>
          {value && allowNone && (
            <button type="button" className="btn btn-small" onClick={() => onChange(null)}>
              Lepas
            </button>
          )}
        </div>
      </div>
      {current && <div className="muted small">{current.originalName ?? "berkas"} · {fmtSize(current.bytes)}{kind === "audio" && ` · ${fmtDur(current.durationMs)}`}</div>}
      {hint && <div className="hint">{hint}</div>}

      {open && (
        <div className="media-panel stack">
          <div>
            <label className="btn btn-primary btn-small" htmlFor={inputId}>
              {send.isPending ? "Mengunggah…" : kind === "image" ? "Unggah gambar" : "Unggah audio"}
            </label>
            <input
              id={inputId}
              type="file"
              hidden
              accept={kind === "image" ? "image/jpeg,image/png,image/webp" : "audio/mpeg,audio/ogg,audio/mp4,.m4a"}
              disabled={send.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) send.mutate(f);
                e.target.value = "";
              }}
            />
            <div className="muted small" style={{ marginTop: 6 }}>
              {kind === "image" ? "JPEG, PNG, atau WebP, maks. 5 MB. Lokasi GPS di foto dihapus otomatis." : "MP3, OGG, atau M4A, maks. 10 MB dan 6 menit."}
            </div>
          </div>
          <ErrorAlert error={send.error} />
          {list.data && list.data.media.length > 0 && (
            <div className={kind === "image" ? "media-grid" : "stack"}>
              {list.data.media.map((m) =>
                kind === "image" ? (
                  <button
                    type="button"
                    key={m.id}
                    className={m.id === value ? "media-tile selected" : "media-tile"}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  >
                    <img src={mediaUrl(m.id)} alt={m.originalName ?? ""} loading="lazy" />
                  </button>
                ) : (
                  <div key={m.id} className="audio-row">
                    <audio controls preload="none" src={mediaUrl(m.id)} />
                    <span className="small">{m.originalName} · {fmtDur(m.durationMs)}</span>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        onChange(m.id);
                        setOpen(false);
                      }}
                    >
                      {m.id === value ? "Terpilih" : "Pakai"}
                    </button>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
