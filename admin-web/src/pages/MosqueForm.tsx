import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type Mosque, api } from "../api";
import { ConfirmAction, ErrorAlert, Field, Loading, PageHead, TIMEZONES, fieldErrors } from "../components/ui";

interface FormState {
  name: string;
  regionLabel: string;
  latitude: string;
  longitude: string;
  timezone: string;
}
const empty: FormState = { name: "", regionLabel: "", latitude: "", longitude: "", timezone: "Asia/Jakarta" };

/** Menerima koma atau titik sebagai pemisah desimal. */
const toNumber = (s: string) => (s.trim() === "" ? Number.NaN : Number(s.trim().replace(",", ".")));

export function MosqueFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Halaman ubah mengambil data dari daftar (aktif & arsip) agar tidak perlu rute GET tunggal.
  const list = useQuery({
    queryKey: ["mosques", "all-for-edit"],
    enabled: !isNew,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        api<{ mosques: Mosque[] }>("GET", "/api/admin/mosques?archived=0"),
        api<{ mosques: Mosque[] }>("GET", "/api/admin/mosques?archived=1"),
      ]);
      return [...a.mosques, ...b.mosques];
    },
  });
  const mosque = list.data?.find((m) => m.id === id);

  const [form, setForm] = useState<FormState>(empty);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (mosque) {
      setForm({
        name: mosque.name,
        regionLabel: mosque.regionLabel ?? "",
        latitude: String(mosque.latitude),
        longitude: String(mosque.longitude),
        timezone: mosque.timezone,
      });
    }
  }, [mosque]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["mosques"] });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew
        ? api<{ mosque: Mosque }>("POST", "/api/admin/mosques", body)
        : api<{ mosque: Mosque }>("PATCH", `/api/admin/mosques/${id}`, body),
    onSuccess: async () => {
      await invalidate();
      if (isNew) navigate("/masjid");
      else setSaved(true);
    },
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) => api<{ mosque: Mosque }>("PATCH", `/api/admin/mosques/${id}`, { archived }),
    onSuccess: async () => {
      await invalidate();
      navigate("/masjid");
    },
  });

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const latitude = toNumber(form.latitude);
    const longitude = toNumber(form.longitude);
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 3) errs.name = "Nama masjid minimal 3 karakter.";
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) errs.latitude = "Isi lintang antara −90 dan 90.";
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) errs.longitude = "Isi bujur antara −180 dan 180.";
    setLocalErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({
      name: form.name.trim(),
      regionLabel: form.regionLabel.trim() || null,
      latitude,
      longitude,
      timezone: form.timezone,
    });
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoMsg("Browser ini tidak mendukung lokasi. Isi koordinat secara manual.");
      return;
    }
    setGeoMsg("Mengambil lokasi…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setGeoMsg(`Lokasi terisi (akurasi ± ${Math.round(pos.coords.accuracy)} m). Pastikan Anda sedang berada di masjid.`);
      },
      () => setGeoMsg("Izin lokasi ditolak atau lokasi tidak tersedia. Isi koordinat secara manual."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  if (!isNew && list.isPending) return <Loading />;
  if (!isNew && list.isError) return <ErrorAlert error={list.error} />;
  if (!isNew && !mosque) {
    return (
      <div className="stack">
        <PageHead title="Masjid tidak ditemukan" back={{ to: "/masjid", label: "Masjid" }} />
      </div>
    );
  }

  const errors = { ...fieldErrors(save.error), ...localErrors };
  const archived = Boolean(mosque?.archivedAt);

  return (
    <div className="stack">
      <PageHead title={isNew ? "Tambah masjid" : mosque!.name} back={{ to: "/masjid", label: "Masjid" }} />

      <form className="card stack" onSubmit={onSubmit} noValidate>
        <Field label="Nama masjid" error={errors.name}>
          {(p) => <input {...p} type="text" value={form.name} onChange={set("name")} maxLength={120} autoComplete="off" />}
        </Field>
        <Field label="Wilayah" hint="Ditampilkan di TV, mis. “Kota Bandung”. Boleh dikosongkan." error={errors.regionLabel}>
          {(p) => <input {...p} type="text" value={form.regionLabel} onChange={set("regionLabel")} maxLength={120} />}
        </Field>

        <div className="stack">
          <div className="grid-2">
            <Field label="Lintang (latitude)" error={errors.latitude}>
              {(p) => <input {...p} type="text" inputMode="decimal" className="mono" value={form.latitude} onChange={set("latitude")} placeholder="-6.914744" />}
            </Field>
            <Field label="Bujur (longitude)" error={errors.longitude}>
              {(p) => <input {...p} type="text" inputMode="decimal" className="mono" value={form.longitude} onChange={set("longitude")} placeholder="107.609810" />}
            </Field>
          </div>
          <div>
            <button type="button" className="btn btn-small" onClick={useMyLocation}>
              Pakai lokasi saya sekarang
            </button>
            {geoMsg && <div className="muted small" style={{ marginTop: 6 }}>{geoMsg}</div>}
          </div>
          <div className="muted small">
            Koordinat menentukan jadwal shalat. Di Google Maps, tekan lama titik masjid lalu salin angka yang muncul.
          </div>
        </div>

        <Field label="Zona waktu" error={errors.timezone}>
          {(p) => (
            <select {...p} value={form.timezone} onChange={set("timezone")}>
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        {save.isError && Object.keys(fieldErrors(save.error)).length === 0 && <ErrorAlert error={save.error} />}
        {saved && <div className="alert alert-ok">Perubahan tersimpan. TV memperbarui jadwal dalam beberapa menit.</div>}

        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : isNew ? "Tambah masjid" : "Simpan"}
          </button>
        </div>
      </form>

      {!isNew && (
        <section className="card stack">
          <h2>{archived ? "Pulihkan masjid" : "Arsipkan masjid"}</h2>
          <p className="muted small" style={{ margin: 0 }}>
            {archived
              ? "Masjid akan muncul lagi di daftar dan bisa dikelola pengurusnya."
              : "Masjid disembunyikan dari daftar. Data tetap tersimpan dan bisa dipulihkan kapan saja."}
          </p>
          <ErrorAlert error={archive.error} />
          {archived ? (
            <ConfirmAction
              key="restore"
              label="Pulihkan"
              question={`Pulihkan ${mosque!.name}?`}
              confirmLabel="Ya, pulihkan"
              danger={false}
              busy={archive.isPending}
              onConfirm={() => archive.mutate(false)}
            />
          ) : (
            <ConfirmAction
              key="archive"
              label="Arsipkan"
              question={`Arsipkan ${mosque!.name}? TV yang terhubung tetap menampilkan data terakhir.`}
              confirmLabel="Ya, arsipkan"
              busy={archive.isPending}
              onConfirm={() => archive.mutate(true)}
            />
          )}
        </section>
      )}
    </div>
  );
}
