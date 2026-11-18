import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { type IqamahKey, type Mosque, type PrayerKey, type Settings, type SoundType, api } from "../api";
import { Section, Segmented, SaveBar, Stepper, Toggle } from "../components/controls";
import { MediaPicker } from "../components/MediaPicker";
import { ErrorAlert, Field, Loading, TIMEZONES, fieldErrors } from "../components/ui";
import { HADITH_CATEGORIES } from "../labels";
import { LeaveGuard, mosqueQueryKey, useMosque, useSettingsForm } from "../mosque";

const PRAYERS: { key: PrayerKey; label: string }[] = [
  { key: "imsak", label: "Imsak" },
  { key: "subuh", label: "Subuh" },
  { key: "terbit", label: "Terbit" },
  { key: "dzuhur", label: "Dzuhur" },
  { key: "ashar", label: "Ashar" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isya", label: "Isya" },
];
const IQAMAH: { key: IqamahKey; label: string }[] = PRAYERS.filter((p): p is { key: IqamahKey; label: string } =>
  ["subuh", "dzuhur", "ashar", "maghrib", "isya"].includes(p.key),
);
const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabiul Awal",
  "Rabiul Akhir",
  "Jumadil Awal",
  "Jumadil Akhir",
  "Rajab",
  "Sya'ban",
  "Ramadhan",
  "Syawal",
  "Dzulqa'dah",
  "Dzulhijjah",
];

/** Kerangka bersama halaman pengaturan: memuat, menampilkan galat, bilah simpan, penjaga keluar. */
function SettingsPage({ children }: { children: (s: Settings, update: (fn: (s: Settings) => void) => void, fields: Record<string, string>) => ReactNode }) {
  const { mosque } = useMosque();
  const form = useSettingsForm(mosque.id);
  if (form.query.isPending || !form.draft) return form.query.isError ? <ErrorAlert error={form.query.error} /> : <Loading />;
  const hasFieldErrors = Object.keys(form.fields).length > 0;
  return (
    <div className="stack with-savebar">
      <div className="settings-grid">{children(form.draft, form.update, form.fields)}</div>
      {form.error && (
        <div className="alert alert-error" role="alert">
          {form.error.message}
          {hasFieldErrors && (
            <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {Object.entries(form.fields).map(([k, v]) => (
                <li key={k}>
                  <span className="mono">{k}</span>: {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <SaveBar
        dirty={form.dirty}
        saving={form.saving}
        onSave={form.save}
        onReset={form.reset}
        message={form.savedAt ? "Tersimpan. Status penerapan di TV tampil di bagian atas halaman." : undefined}
      />
      <LeaveGuard blocker={form.blocker} />
    </div>
  );
}

// ---- Jadwal -------------------------------------------------------------------------

export function SchedulePage() {
  return (
    <SettingsPage>
      {(s, update, fields) => (
        <>
          <LocationSection />

          <Section title="Sumber jadwal" description="Pilih cara menentukan jadwal shalat.">
            <Segmented
              label="Waktu shalat dihitung"
              value={s.schedule.source}
              options={[
                { value: "KEMENAG", label: "Otomatis (Kemenag RI)" },
                { value: "MANUAL", label: "Diatur manual" },
              ]}
              onChange={(v) => update((d) => void (d.schedule.source = v))}
              hint={s.schedule.source === "KEMENAG" ? "Dihitung dari lokasi masjid di atas." : "Jam di bawah dipakai setiap hari sampai diubah lagi."}
            />
            {s.schedule.source === "MANUAL" && (
              <div className="times-grid">
                {PRAYERS.map((p) => (
                  <label key={p.key} className="field">
                    <span className="label">{p.label}</span>
                    <input
                      type="time"
                      className="mono"
                      value={s.schedule.manualTimes[p.key]}
                      onChange={(e) => update((d) => void (d.schedule.manualTimes[p.key] = e.target.value))}
                      aria-invalid={Boolean(fields[`schedule.manualTimes.${p.key}`])}
                    />
                  </label>
                ))}
              </div>
            )}
          </Section>

          <Section title="Waktu yang ditampilkan">
            <Toggle label="Tampilkan Imsak" checked={s.schedule.showImsak} onChange={(v) => update((d) => void (d.schedule.showImsak = v))} />
            <Toggle label="Tampilkan Terbit" checked={s.schedule.showTerbit} onChange={(v) => update((d) => void (d.schedule.showTerbit = v))} />
          </Section>

          <Section title="Koreksi menit" description="Geser tiap waktu beberapa menit agar sama dengan jadwal masjid setempat.">
            <Toggle label="Pakai koreksi menit" checked={s.schedule.offsetsEnabled} onChange={(v) => update((d) => void (d.schedule.offsetsEnabled = v))} />
            {s.schedule.offsetsEnabled && (
              <div className="stepper-list">
                {PRAYERS.map((p) => (
                  <Stepper
                    key={p.key}
                    label={p.label}
                    value={s.schedule.offsets[p.key]}
                    min={-15}
                    max={15}
                    signed
                    error={fields[`schedule.offsets.${p.key}`]}
                    onChange={(v) => update((d) => void (d.schedule.offsets[p.key] = v))}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Tanggal Hijriah">
            <Segmented
              label="Tanggal Hijriah"
              value={s.schedule.hijri.source}
              options={[
                { value: "HISAB", label: "Otomatis (hisab)" },
                { value: "MANUAL", label: "Diatur manual" },
              ]}
              onChange={(v) =>
                update((d) => {
                  d.schedule.hijri.source = v;
                  if (v === "MANUAL" && !d.schedule.hijri.manual) {
                    d.schedule.hijri.manual = {
                      day: 1,
                      month: 1,
                      year: 1448,
                      setOn: new Date().toLocaleDateString("en-CA"),
                    };
                  }
                })
              }
            />
            {s.schedule.hijri.source === "HISAB" ? (
              <div className="stepper-list">
                <Stepper
                  label="Geser tanggal"
                  unit="hari"
                  value={s.schedule.hijri.dayOffset}
                  min={-2}
                  max={2}
                  signed
                  onChange={(v) => update((d) => void (d.schedule.hijri.dayOffset = v))}
                />
              </div>
            ) : (
              s.schedule.hijri.manual && (
                <div className="stack">
                  <div className="hijri-grid">
                    <label className="field">
                      <span className="label">Tanggal</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={s.schedule.hijri.manual.day}
                        onChange={(e) => update((d) => void (d.schedule.hijri.manual!.day = Number(e.target.value)))}
                      />
                    </label>
                    <label className="field">
                      <span className="label">Bulan</span>
                      <select
                        value={s.schedule.hijri.manual.month}
                        onChange={(e) => update((d) => void (d.schedule.hijri.manual!.month = Number(e.target.value)))}
                      >
                        {HIJRI_MONTHS.map((m, i) => (
                          <option key={m} value={i + 1}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Tahun</span>
                      <input
                        type="number"
                        min={1400}
                        max={1600}
                        value={s.schedule.hijri.manual.year}
                        onChange={(e) => update((d) => void (d.schedule.hijri.manual!.year = Number(e.target.value)))}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span className="label">Berlaku untuk tanggal Masehi</span>
                    <input
                      type="date"
                      value={s.schedule.hijri.manual.setOn}
                      onChange={(e) => update((d) => void (d.schedule.hijri.manual!.setOn = e.target.value))}
                    />
                    <span className="hint">TV menghitung hari-hari berikutnya dari tanggal ini.</span>
                  </label>
                </div>
              )
            )}
          </Section>

          <Section title="Iqamah">
            <div className="stepper-list">
              {IQAMAH.map((p) => (
                <Stepper
                  key={p.key}
                  label={`Jeda iqamah ${p.label}`}
                  value={s.prayerCycle.iqamahGapMinutes[p.key]}
                  min={0}
                  max={60}
                  onChange={(v) => update((d) => void (d.prayerCycle.iqamahGapMinutes[p.key] = v))}
                />
              ))}
            </div>
            <Toggle
              label="Jam adzan & iqamah bergantian"
              hint="Kotak jadwal bergantian menampilkan jam adzan dan jam iqamah. Bila mati, hanya jam adzan."
              checked={s.prayerCycle.showIqamahCycle}
              onChange={(v) => update((d) => void (d.prayerCycle.showIqamahCycle = v))}
            />
          </Section>

          <Section title="Hitung mundur layar penuh">
            <Toggle
              label="Hitung mundur layar penuh"
              hint="Angka hitung mundur besar memenuhi layar menjelang adzan dan selama jeda iqamah."
              checked={s.prayerCycle.fullScreenCountdown.enabled}
              onChange={(v) => update((d) => void (d.prayerCycle.fullScreenCountdown.enabled = v))}
            />
            {s.prayerCycle.fullScreenCountdown.enabled && (
              <Stepper
                label="Mulai sebelum adzan"
                value={s.prayerCycle.fullScreenCountdown.minutes}
                min={1}
                max={30}
                onChange={(v) => update((d) => void (d.prayerCycle.fullScreenCountdown.minutes = v))}
              />
            )}
          </Section>

          <Section title="Layar waktu shalat & Jumat">
            <Toggle
              label="Layar khusus Jumat"
              hint="Tampil saat shalat Jumat, menggantikan layar biasa."
              checked={s.prayerCycle.jumat.screenEnabled}
              onChange={(v) => update((d) => void (d.prayerCycle.jumat.screenEnabled = v))}
            />
            {s.prayerCycle.jumat.screenEnabled && (
              <Stepper
                label="Lama layar Jumat"
                value={s.prayerCycle.jumat.durationMinutes}
                min={30}
                max={120}
                step={5}
                onChange={(v) => update((d) => void (d.prayerCycle.jumat.durationMinutes = v))}
              />
            )}
            <Stepper
              label="Lama layar waktu shalat"
              value={s.prayerCycle.prayerScreenMinutes}
              min={1}
              max={15}
              onChange={(v) => update((d) => void (d.prayerCycle.prayerScreenMinutes = v))}
            />
            <div className="hint">Layar “Waktu shalat” tampil setelah iqamah, saat jamaah sedang shalat.</div>
          </Section>

          <Section title="Bayan malam Jumat">
            <Toggle
              label="Bayan malam Jumat"
              hint="Iqamah Isya pada Kamis malam diundur selama bayan."
              checked={s.prayerCycle.jumatNightBayan.enabled}
              onChange={(v) => update((d) => void (d.prayerCycle.jumatNightBayan.enabled = v))}
            />
            {s.prayerCycle.jumatNightBayan.enabled && (
              <Stepper
                label="Lama bayan"
                value={s.prayerCycle.jumatNightBayan.minutes}
                min={0}
                max={120}
                step={5}
                onChange={(v) => update((d) => void (d.prayerCycle.jumatNightBayan.minutes = v))}
              />
            )}
          </Section>
        </>
      )}
    </SettingsPage>
  );
}

/** Lokasi disimpan terpisah karena berada di data masjid, bukan dokumen pengaturan. */
function LocationSection() {
  const { mosque } = useMosque();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    regionLabel: "",
    latitude: "",
    longitude: "",
    timezone: "Asia/Jakarta",
  });
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  useEffect(() => {
    setForm({
      name: mosque.name,
      regionLabel: mosque.regionLabel ?? "",
      latitude: String(mosque.latitude),
      longitude: String(mosque.longitude),
      timezone: mosque.timezone,
    });
  }, [mosque]);
  const save = useMutation({
    mutationFn: () =>
      api<{ mosque: Mosque }>("PATCH", `/api/admin/mosques/${mosque.id}`, {
        name: form.name.trim(),
        regionLabel: form.regionLabel.trim() || null,
        latitude: Number(form.latitude.replace(",", ".")),
        longitude: Number(form.longitude.replace(",", ".")),
        timezone: form.timezone,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: mosqueQueryKey(mosque.id) }),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    save.reset();
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  const changed =
    form.name !== mosque.name ||
    form.regionLabel !== (mosque.regionLabel ?? "") ||
    form.latitude !== String(mosque.latitude) ||
    form.longitude !== String(mosque.longitude) ||
    form.timezone !== mosque.timezone;
  const errors = fieldErrors(save.error);

  function locate() {
    if (!("geolocation" in navigator)) return setGeoMsg("Browser ini tidak mendukung lokasi.");
    setGeoMsg("Mengambil lokasi…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        save.reset();
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setGeoMsg(`Lokasi terisi (akurasi ± ${Math.round(pos.coords.accuracy)} m). Tekan Simpan lokasi.`);
      },
      () => setGeoMsg("Izin lokasi ditolak atau lokasi tidak tersedia. Isi koordinat secara manual."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <form
      className="card stack"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      noValidate
    >
      <div>
        <h2>Nama & lokasi masjid</h2>
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          Menentukan jadwal shalat, cuaca, dan nama yang tampil di TV.
        </p>
      </div>
      <Field label="Nama masjid" error={errors.name}>
        {(p) => <input {...p} type="text" value={form.name} onChange={set("name")} maxLength={120} />}
      </Field>
      <Field label="Wilayah" error={errors.regionLabel}>
        {(p) => <input {...p} type="text" value={form.regionLabel} onChange={set("regionLabel")} maxLength={120} />}
      </Field>
      <div className="grid-2">
        <Field label="Lintang (latitude)" error={errors.latitude}>
          {(p) => <input {...p} type="text" inputMode="decimal" className="mono" value={form.latitude} onChange={set("latitude")} />}
        </Field>
        <Field label="Bujur (longitude)" error={errors.longitude}>
          {(p) => <input {...p} type="text" inputMode="decimal" className="mono" value={form.longitude} onChange={set("longitude")} />}
        </Field>
      </div>
      <div>
        <button type="button" className="btn btn-small" onClick={locate}>
          Pakai lokasi saya sekarang
        </button>
        {geoMsg && (
          <div className="muted small" style={{ marginTop: 6 }}>
            {geoMsg}
          </div>
        )}
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
      {save.isError && Object.keys(errors).length === 0 && <ErrorAlert error={save.error} />}
      {save.isSuccess && <div className="alert alert-ok">Lokasi tersimpan. TV akan memperbarui jadwal dalam 1 menit.</div>}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!changed || save.isPending}>
          {save.isPending ? "Menyimpan…" : "Simpan lokasi"}
        </button>
      </div>
    </form>
  );
}

// ---- Suara --------------------------------------------------------------------------
// Urutan dan nama bagian sama dengan menu Pengaturan di aplikasi TV (Suara adzan, Suara iqamah).

const soundOptions: {
  value: SoundType;
  label: string;
  disabled?: boolean;
  note?: string;
}[] = [
  { value: "TICK", label: "Tik-tik (hitung mundur 5 detik)" },
  { value: "BEEP", label: "Bip (nyaring)" },
  { value: "CUSTOM", label: "Audio sendiri (mis. rekaman adzan)" },
];

export function SoundPage() {
  const { mosque } = useMosque();
  return (
    <SettingsPage>
      {(s, update, fields) => (
        <>
          {!s.sound.enabled && (
            <div className="feature-note" role="status">
              <span>Semua suara sedang dimatikan, jadi TV tidak berbunyi saat adzan maupun iqamah.</span>
              <button type="button" className="btn btn-small btn-primary" onClick={() => update((d) => void (d.sound.enabled = true))}>
                Nyalakan suara
              </button>
            </div>
          )}
          {(["adzan", "iqamah"] as const).map((k) => (
            <Section key={k} title={k === "adzan" ? "Suara adzan" : "Suara iqamah"} description={`Tes suara ${k} bisa dilakukan dari menu Pengaturan di TV.`}>
              <Toggle
                label={k === "adzan" ? "Bunyikan suara saat adzan" : "Bunyikan suara saat iqamah"}
                checked={s.sound[k].enabled}
                disabled={!s.sound.enabled}
                onChange={(v) => update((d) => void (d.sound[k].enabled = v))}
              />
              <Segmented label="Jenis suara" value={s.sound[k].type} options={soundOptions} onChange={(v) => update((d) => void (d.sound[k].type = v))} />
              {s.sound[k].type === "CUSTOM" && (
                <>
                  <MediaPicker
                    mosqueId={mosque.id}
                    kind="audio"
                    label={k === "adzan" ? "Audio adzan" : "Audio iqamah"}
                    hint="TV mengunduhnya sekali lalu menyimpannya, jadi tetap berbunyi saat internet putus."
                    value={s.sound[k].mediaId}
                    onChange={(id) => update((d) => void (d.sound[k].mediaId = id))}
                  />
                  {fields[`sound.${k}.mediaId`] && <div className="error small">Pilih atau unggah audio terlebih dahulu.</div>}
                </>
              )}
            </Section>
          ))}
        </>
      )}
    </SettingsPage>
  );
}

// ---- Tampilan -----------------------------------------------------------------------
// Urutan sama dengan aplikasi TV: Logo & gambar latar, Tema warna, Bahasa, Jam, Mode malam, Cuaca.

const THEMES: { id: string; name: string; accent: string }[] = [
  { id: "classic_mosque", name: "Classic Mosque", accent: "#B08D57" },
  { id: "midnight_blue", name: "Midnight Blue", accent: "#F0F0F0" },
  { id: "desert_sand", name: "Desert Sand", accent: "#E39A5D" },
  { id: "royal_purple", name: "Royal Purple", accent: "#FFD93D" },
  { id: "ocean_teal", name: "Ocean Teal", accent: "#F5F5F5" },
  { id: "elegant_charcoal", name: "Elegant Charcoal", accent: "#F5C4A6" },
  { id: "emerald_garden", name: "Emerald Garden", accent: "#FFD700" },
  { id: "burgundy_elegance", name: "Burgundy Elegance", accent: "#E5E5E5" },
  { id: "sapphire_night", name: "Sapphire Night", accent: "#F8F9FA" },
  { id: "amber_sunset", name: "Amber Sunset", accent: "#FFF8E1" },
];

const hours = Array.from({ length: 24 }, (_, h) => h);

export function DisplayPage() {
  const { mosque } = useMosque();
  const mediaFields = [
    {
      key: "logoId",
      label: "Logo masjid",
      hint: "Tampil di samping nama masjid. Gambar persegi berlatar transparan (PNG) paling pas.",
    },
    {
      key: "backgroundMainId",
      label: "Latar layar utama",
      hint: "Kosongkan untuk memakai warna tema.",
    },
    { key: "backgroundPrayerId", label: "Latar layar waktu shalat" },
    { key: "backgroundIqamahId", label: "Latar layar iqamah" },
  ] as const;
  return (
    <SettingsPage>
      {(s, update) => (
        <>
          <Section title="Logo & gambar latar">
            {mediaFields.map((f) => (
              <MediaPicker
                key={f.key}
                mosqueId={mosque.id}
                kind="image"
                label={f.label}
                hint={"hint" in f ? f.hint : undefined}
                value={s.display.media[f.key]}
                onChange={(id) => update((d) => void (d.display.media[f.key] = id))}
              />
            ))}
          </Section>

          <Section title="Tema warna">
            <div className="themes" role="radiogroup" aria-label="Tema warna">
              {THEMES.map((t) => (
                <label key={t.id} className="theme">
                  <input type="radio" name="theme" checked={s.display.colorTheme === t.id} onChange={() => update((d) => void (d.display.colorTheme = t.id))} />
                  <span className="swatch" style={{ color: t.accent }} aria-hidden="true">
                    12:30
                  </span>
                  <span className="small">{t.name}</span>
                </label>
              ))}
            </div>
          </Section>

          <Section title="Bahasa">
            <Segmented
              label="Bahasa di layar TV"
              value={s.display.language}
              options={[
                { value: "id", label: "Indonesia" },
                { value: "en", label: "English" },
              ]}
              onChange={(v) => update((d) => void (d.display.language = v))}
            />
          </Section>

          <Section title="Jam" description="Ukuran jam menyesuaikan kotaknya di TV secara otomatis.">
            <Toggle label="Tampilkan detik" checked={s.display.clock.showSeconds} onChange={(v) => update((d) => void (d.display.clock.showSeconds = v))} />
            <Toggle label="Format 24 jam" checked={s.display.clock.use24h} onChange={(v) => update((d) => void (d.display.clock.use24h = v))} />
          </Section>

          <Section title="Mode malam" description="Layar diredupkan pada jam malam agar tidak silau dan hemat listrik.">
            <Toggle
              label="Redupkan layar di malam hari"
              checked={s.display.nightMode.enabled}
              onChange={(v) => update((d) => void (d.display.nightMode.enabled = v))}
            />
            {s.display.nightMode.enabled && (
              <>
                <div className="grid-2">
                  {(["startHour", "endHour"] as const).map((k) => (
                    <label key={k} className="field">
                      <span className="label">{k === "startHour" ? "Jam mulai" : "Jam selesai"}</span>
                      <select value={s.display.nightMode[k]} onChange={(e) => update((d) => void (d.display.nightMode[k] = Number(e.target.value)))}>
                        {hours.map((h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, "0")}.00
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <Stepper
                  label="Tingkat redup"
                  unit="%"
                  value={s.display.nightMode.dimPercent}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(v) => update((d) => void (d.display.nightMode.dimPercent = v))}
                />
              </>
            )}
          </Section>

          <Section title="Cuaca">
            <Toggle
              label="Tampilkan cuaca"
              hint="Suhu dan cuaca di lokasi masjid tampil di layar TV, diperbarui otomatis."
              checked={s.display.showWeather}
              onChange={(v) => update((d) => void (d.display.showWeather = v))}
            />
          </Section>

          <Section title="Selalu kembali ke SIWAK" description="Bila SIWAK tertutup aplikasi lain (misalnya YouTube), TV membukanya lagi otomatis.">
            <Toggle
              label="Buka SIWAK lagi otomatis"
              hint="Butuh izin “Tampil di atas aplikasi lain” di TV (Pengaturan → Sistem → Izin aplikasi)."
              checked={s.kiosk.autoReturn.enabled}
              onChange={(v) => update((d) => void (d.kiosk.autoReturn.enabled = v))}
            />
            {s.kiosk.autoReturn.enabled && (
              <Stepper
                label="Setelah tertutup selama"
                value={s.kiosk.autoReturn.minutes}
                min={1}
                max={120}
                onChange={(v) => update((d) => void (d.kiosk.autoReturn.minutes = v))}
              />
            )}
          </Section>
        </>
      )}
    </SettingsPage>
  );
}

// ---- Pengaturan yang tampil di menu Konten ---------------------------------------------
// Cara tampil slide & hadits diatur di halaman kontennya sendiri agar pengurus tidak bolak-balik menu.

/** Kartu pengaturan kecil dengan tombol Simpan sendiri (dipakai di halaman Slide dan Hadits). */
function InlineSettings({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: (s: Settings, update: (fn: (s: Settings) => void) => void) => ReactNode;
}) {
  const { mosque } = useMosque();
  const qc = useQueryClient();
  const form = useSettingsForm(mosque.id);
  useEffect(() => {
    if (!form.savedAt) return;
    void qc.invalidateQueries({ queryKey: ["overview", mosque.id] });
    void qc.invalidateQueries({ queryKey: ["preview", mosque.id] });
  }, [form.savedAt, qc, mosque.id]);
  if (form.query.isPending || !form.draft) return form.query.isError ? <ErrorAlert error={form.query.error} /> : <Loading />;
  return (
    <section className="card stack settings-inline">
      <div>
        <h2>{title}</h2>
        {description && (
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {description}
          </p>
        )}
      </div>
      {children(form.draft, form.update)}
      {form.error && <ErrorAlert error={form.error} />}
      {(form.dirty || form.savedAt) && (
        <div className="inline-save">
          <span className="small">{form.dirty ? "Ada perubahan yang belum disimpan." : "Tersimpan. TV menerapkannya dalam beberapa detik."}</span>
          {form.dirty && (
            <div className="actions" style={{ margin: 0 }}>
              <button type="button" className="btn btn-small" onClick={form.reset} disabled={form.saving}>
                Batalkan
              </button>
              <button type="button" className="btn btn-primary btn-small" disabled={form.saving} onClick={form.save}>
                {form.saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          )}
        </div>
      )}
      <LeaveGuard blocker={form.blocker} />
    </section>
  );
}

/** Cara tampil slide & hadits di TV (dulu "Layar konten" di menu Tampilan). */
export function ContentDisplaySettings() {
  return (
    <InlineSettings title="Cara tampil di TV" description="Slide (info masjid, gambar) dan hadits diputar bergantian di layar TV.">
      {(s, update) => {
        const beside = s.display.layout === "GALERI";
        const full = s.display.mutiaraHadits.enabled;
        return (
          <>
            <Toggle
              label="Tampilkan slide & hadits"
              hint="Bila dimatikan, TV hanya menampilkan jam dan jadwal shalat."
              checked={s.display.content.enabled}
              onChange={(v) =>
                update((d) => {
                  d.display.content.enabled = v;
                  // Saat dinyalakan, pastikan ada cara tampil agar slide langsung terlihat.
                  if (v && d.display.layout !== "GALERI" && !d.display.mutiaraHadits.enabled) d.display.layout = "GALERI";
                })
              }
            />
            {s.display.content.enabled && (
              <>
                <div className="choice-cards">
                  <div className={`choice-card${beside ? " on" : ""}`}>
                    <Toggle
                      label="Di samping jam"
                      hint="Layar dibagi dua: slide di kiri, jam dan jadwal di kanan. Slide berganti terus."
                      checked={beside}
                      onChange={(v) => update((d) => void (d.display.layout = v ? "GALERI" : "BAR_BAWAH"))}
                    />
                    {beside && s.display.content.autoHadith && (
                      <>
                        <Stepper
                          label="Lama tiap hadits otomatis"
                          unit="detik"
                          value={s.display.content.slideSeconds}
                          min={10}
                          max={60}
                          step={5}
                          onChange={(v) => update((d) => void (d.display.content.slideSeconds = v))}
                        />
                        <div className="muted small">Slide buatan Anda memakai lama tampil masing-masing (tombol Atur waktu tayang di daftar slide).</div>
                      </>
                    )}
                  </div>
                  <div className={`choice-card${full ? " on" : ""}`}>
                    <Toggle
                      label="Sesekali satu layar penuh"
                      hint="Satu slide memenuhi layar sebentar, lalu kembali ke jam."
                      checked={full}
                      onChange={(v) => update((d) => void (d.display.mutiaraHadits.enabled = v))}
                    />
                    {full && (
                      <>
                        <Stepper
                          label="Muncul setiap"
                          unit="menit"
                          value={s.display.mutiaraHadits.everyMinutes}
                          min={1}
                          max={60}
                          onChange={(v) => update((d) => void (d.display.mutiaraHadits.everyMinutes = v))}
                        />
                        <Stepper
                          label="Lama tampil layar penuh"
                          unit="detik"
                          value={s.display.mutiaraHadits.showSeconds}
                          min={10}
                          max={120}
                          step={5}
                          onChange={(v) => update((d) => void (d.display.mutiaraHadits.showSeconds = v))}
                        />
                      </>
                    )}
                  </div>
                  {!beside && !full && (
                    <div className="feature-note">
                      <span>Pilih minimal satu: di samping jam, atau sesekali satu layar penuh.</span>
                    </div>
                  )}
                </div>
                <Segmented
                  label="Gambar masjid di latar slide"
                  value={s.display.illustration.silhouette}
                  options={[
                    { value: "KUBAH", label: "Kubah" },
                    { value: "TUMPANG", label: "Atap tumpang" },
                    { value: "MUSHOLLA", label: "Musholla" },
                  ]}
                  onChange={(v) => update((d) => void (d.display.illustration.silhouette = v))}
                />
              </>
            )}
          </>
        );
      }}
    </InlineSettings>
  );
}

/** Pilihan hadits otomatis: tema, lama tampil, dan gambar latarnya. */
export function HadithDisplaySettings() {
  return (
    <InlineSettings
      title="Hadits otomatis"
      description="TV memutar hadits terverifikasi dari kumpulan hadits SIWAK dan hadits milik masjid sesuai tema yang dicentang, bergantian dengan slide."
    >
      {(s, update) => (
        <>
          <Toggle
            label="Putar hadits otomatis"
            hint="Matikan bila hanya ingin menampilkan slide yang Anda susun sendiri di menu Slide (termasuk hadits yang dijadikan slide)."
            checked={s.display.content.autoHadith}
            onChange={(v) => update((d) => void (d.display.content.autoHadith = v))}
          />
          {s.display.content.autoHadith && (
            <>
              <fieldset className="segmented-field">
                <legend>Tema hadits</legend>
                <div className="checks">
                  {HADITH_CATEGORIES.map((c) => (
                    <label key={c.id} className="check">
                      <input
                        type="checkbox"
                        checked={s.display.hadithCategories.includes(c.id)}
                        onChange={(e) =>
                          update((d) => {
                            const set = new Set(d.display.hadithCategories);
                            if (e.target.checked) set.add(c.id);
                            else set.delete(c.id);
                            d.display.hadithCategories = HADITH_CATEGORIES.map((x) => x.id).filter((id) => set.has(id));
                          })
                        }
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </>
      )}
    </InlineSettings>
  );
}
