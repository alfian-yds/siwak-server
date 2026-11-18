import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api";
import { ErrorAlert, Field, PageHead, fieldErrors } from "../components/ui";
import { useMosque } from "../mosque";

const fmtCode = (digits: string) => (digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits);

/** Hubungkan TV: ketik 8 digit atau Scan QR (App Flow §4.3). QR hanya mengisi kode. */
export function ConnectTvPage() {
  const { mosque } = useMosque();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const claim = useMutation({
    mutationFn: () => api<{ device: { id: string; name: string }; pin: string }>("POST", "/api/admin/pairing/claim", { code, mosqueId: mosque.id, name: name.trim() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices", mosque.id] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (code.length !== 8) return setLocalError("Kode terdiri dari 8 angka.");
    if (!name.trim()) return setLocalError("Beri nama TV, mis. “Serambi”.");
    claim.mutate();
  }

  if (claim.isSuccess) {
    return (
      <div className="stack">
        <PageHead title="TV terhubung" back={{ to: `/m/${mosque.id}`, label: "TV" }} />
        <div className="card stack">
          <div className="alert alert-ok">“{claim.data.device.name}” sudah terhubung. Layar TV akan berganti dalam beberapa detik.</div>
          <div className="muted small">
            Di TV, berikan izin yang diminta di layar "Izin agar SIWAK lancar" agar perintah dari HP selalu sampai.
          </div>
          <div className="actions">
            <Link className="btn btn-primary" to={`/m/${mosque.id}`}>
              Lihat daftar TV
            </Link>
            <button
              className="btn"
              onClick={() => {
                claim.reset();
                setCode("");
                setName("");
              }}
            >
              Hubungkan TV lain
            </button>
          </div>
        </div>
      </div>
    );
  }

  const errors = fieldErrors(claim.error);
  const notFound = claim.error instanceof ApiError && claim.error.code === "pairing_not_found";
  return (
    <div className="stack">
      <PageHead title="Hubungkan TV" back={{ to: `/m/${mosque.id}`, label: "TV" }} />
      <form className="card stack" onSubmit={onSubmit} noValidate>
        <p className="muted small" style={{ margin: 0 }}>
          Di TV, buka <strong>Pengaturan</strong> lalu pilih <strong>Hubungkan ke website SIWAK</strong>. TV menampilkan kode 8 angka dan kode QR.
        </p>
        <Field label="Kode di layar TV" error={errors.code ?? (notFound ? claim.error?.message : undefined)}>
          {(p) => (
            <input
              {...p}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="code-input mono"
              placeholder="1234 5678"
              value={fmtCode(code)}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          )}
        </Field>
        {scanning ? (
          <QrScanner
            onCode={(c) => {
              setCode(c);
              setScanning(false);
            }}
            onClose={() => setScanning(false)}
          />
        ) : (
          <div>
            <button type="button" className="btn" onClick={() => setScanning(true)}>
              Scan QR
            </button>
          </div>
        )}
        <Field label="Nama TV" hint="Mis. “Serambi”, “Ruang utama”." error={errors.name}>
          {(p) => <input {...p} type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        {localError && <div className="alert alert-error" role="alert">{localError}</div>}
        {claim.isError && !notFound && Object.keys(errors).length === 0 && <ErrorAlert error={claim.error} />}
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={claim.isPending}>
            {claim.isPending ? "Menghubungkan…" : "Hubungkan"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Membaca QR dari kamera belakang. Pustaka dimuat hanya saat dibutuhkan. */
function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Simpan callback di ref agar kamera tidak dibuka ulang setiap halaman induk dirender.
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("Kamera hanya bisa dipakai lewat HTTPS. Ketik kode 8 digit secara manual.");
        return;
      }
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled || !video.current) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video.current, (result) => {
          const digits = result?.getText().replace(/\D/g, "") ?? "";
          if (digits.length === 8) {
            controls.stop();
            onCodeRef.current(digits);
          }
        });
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch (err) {
        const name = (err as { name?: string }).name;
        setError(
          name === "NotAllowedError" ? "Izin kamera ditolak. Ketik kode 8 digit secara manual." : "Kamera tidak bisa dibuka. Ketik kode 8 digit secara manual.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="stack">
      {error ? (
        <div className="alert alert-error" role="alert">{error}</div>
      ) : (
        <div className="scanner">
          <video ref={video} muted playsInline />
          <div className="scanner-frame" aria-hidden="true" />
        </div>
      )}
      <div>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Tutup kamera
        </button>
      </div>
    </div>
  );
}
