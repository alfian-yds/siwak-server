/** Label tampilan yang dipakai beberapa halaman (istilah baku Design Brief §10). */

export const HADITH_CATEGORIES: { id: string; label: string }[] = [
  { id: "adab_masjid", label: "Adab masuk masjid" },
  { id: "shaf_berjamaah", label: "Shaf & berjamaah" },
  { id: "keutamaan", label: "Keutamaan" },
  { id: "kebersihan", label: "Kebersihan & adab" },
  { id: "larangan_masjid", label: "Larangan di masjid" },
  { id: "jumat", label: "Shalat Jumat" },
  { id: "dzikir_doa", label: "Dzikir & doa" },
];
export const categoryLabel = (id: string | null) => HADITH_CATEGORIES.find((c) => c.id === id)?.label ?? id ?? "—";

export const HARI_BESAR: { id: string; label: string }[] = [
  { id: "TAHUN_BARU_HIJRIAH", label: "Tahun Baru Hijriah (1 Muharram)" },
  { id: "ASYURA", label: "Hari Asyura (10 Muharram)" },
  { id: "MAULID_NABI", label: "Maulid Nabi (12 Rabiul Awal)" },
  { id: "ISRA_MIRAJ", label: "Isra Mi'raj (27 Rajab)" },
  { id: "AWAL_RAMADAN", label: "Awal Ramadhan (1 Ramadhan)" },
  { id: "NUZULUL_QURAN", label: "Nuzulul Qur'an (17 Ramadhan)" },
  { id: "IDUL_FITRI", label: "Idul Fitri (1 Syawal)" },
  { id: "ARAFAH", label: "Hari Arafah (9 Dzulhijjah)" },
  { id: "IDUL_ADHA", label: "Idul Adha (10 Dzulhijjah)" },
];

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  hadith: "Hadits",
  info_kas: "Laporan kas",
  info_jumat: "Petugas Jumat",
  info_agenda: "Agenda kegiatan",
  info_hari_besar: "Hari besar",
  info_teks: "Informasi",
  image: "Gambar",
};

/** Bit 0 = Senin … bit 6 = Minggu (Backend Schema slides.days_mask). */
export const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  published: "Tayang",
  submitted: "Menunggu verifikasi",
  verified: "Terverifikasi",
  rejected: "Dikembalikan",
};

export const rupiah = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const tanggal = (iso: unknown) => {
  const d = new Date(`${String(iso)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(iso ?? "") : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

/** Ringkasan satu baris untuk daftar konten. */
export function contentSummary(c: { type: string; translation: string | null; body: Record<string, unknown> | null }): string {
  const b = (c.body ?? {}) as Record<string, unknown>;
  switch (c.type) {
    case "hadith":
      return c.translation ?? "";
    case "info_kas":
      return `Kas per ${tanggal(b.reportDate)}: saldo ${rupiah(Number(b.openingBalance) + Number(b.income) - Number(b.expense))}`;
    case "info_jumat":
      return `Jumat ${tanggal(b.date)}: khatib ${b.khatib}, imam ${b.imam}`;
    case "info_agenda":
      return `${(b.items as unknown[] | undefined)?.length ?? 0} kegiatan`;
    case "info_teks":
      return String(b.title ?? "");
    case "info_hari_besar":
      return HARI_BESAR.find((h) => h.id === b.event)?.label ?? String(b.event);
    case "image":
      return String(b.caption || "Gambar");
    default:
      return "";
  }
}

/**
 * Pesan galat dari TV dalam bahasa awam. Galat jaringan (TV tidak bisa menghubungi website) tidak perlu
 * ditampilkan mentah; TV mencoba lagi otomatis.
 */
export const isNetworkError = (message: string | null | undefined) =>
  /failed to connect|timeout|timed out|unable to resolve|unknownhost|connection (refused|reset)|network|socket/i.test(String(message ?? ""));

export function friendlyTvError(message: string | null | undefined): string {
  const m = String(message ?? "");
  if (/failed to connect|timeout|timed out|unable to resolve|unknownhost|connection (refused|reset)|network|socket/i.test(m)) {
    return "TV sempat tidak bisa menghubungi website (internet atau server terganggu). TV mencoba lagi otomatis.";
  }
  if (/HTTP 5\d\d/i.test(m)) return "Website sedang bermasalah saat TV mengambil data. TV mencoba lagi otomatis.";
  if (/no space|ENOSPC|penyimpanan/i.test(m)) return "Penyimpanan TV penuh. Hapus aplikasi atau berkas yang tidak dipakai di TV.";
  return m || "tanpa keterangan";
}

/** Judul kejadian TV untuk riwayat (F-ADM-16). */
export function eventText(e: { type: string; detail: Record<string, unknown> | null }): string {
  const d = e.detail ?? {};
  switch (e.type) {
    case "paired":
      return `Dihubungkan${d.by ? ` oleh ${d.by}` : ""}`;
    case "online":
      return "Online kembali";
    case "offline":
      return "Offline (tidak ada heartbeat 5 menit)";
    case "clock_drift": {
      const s = Number(d.driftSec ?? 0);
      return `Jam TV selisih ${Math.round(Math.abs(s) / 60) || 1} menit ${s > 0 ? "lebih cepat" : "lebih lambat"}`;
    }
    case "error":
      return `Masalah di TV: ${friendlyTvError(d.message as string | undefined)}`;
    case "updated":
      return `Aplikasi diperbarui ${d.from ?? "?"} → ${d.to ?? "?"}`;
    case "unpaired":
      return `Diputus dari website${d.by ? ` oleh ${d.by}` : ""}`;
    case "app_foreground":
      return "SIWAK tampil di layar";
    case "app_background":
      return "SIWAK tertutup aplikasi lain";
    case "command":
      return `Perintah ${d.ok ? "berhasil" : "gagal"}${d.message ? `: ${d.message}` : ""}`;
    default:
      return e.type;
  }
}

/** Label aksi log aktivitas (F-ADM-17). Aksi yang tidak dikenal ditampilkan apa adanya. */
export const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Masuk",
  "auth.logout": "Keluar",
  "settings.update": "Mengubah pengaturan",
  "mosque.create": "Membuat masjid",
  "mosque.update": "Mengubah data masjid",
  "mosque.archive": "Mengarsipkan masjid",
  "mosque.restore": "Memulihkan masjid",
  "user.create": "Menambah pengguna",
  "user.update": "Mengubah pengguna",
  "user.disable": "Menonaktifkan pengguna",
  "user.enable": "Mengaktifkan pengguna",
  "device.pair": "Menghubungkan TV",
  "device.rename": "Mengganti nama TV",
  "device.unpair": "Memutus TV dari website",
  "device.pin.view": "Melihat PIN TV",
  "device.pin.reset": "Membuat PIN baru",
  "device.command.open_app": "Perintah Buka SIWAK",
  "device.command.sync_now": "Perintah Perbarui data TV",
  "device.command.restart_app": "Perintah Mulai ulang SIWAK",
  "device.command.show_mutiara": "Perintah Tampilkan slide layar penuh",
  "slide.reorder": "Mengurutkan slide",
  "running_text.create": "Menambah teks berjalan",
  "running_text.update": "Mengubah teks berjalan",
  "running_text.delete": "Menghapus teks berjalan",
  "running_text.reorder": "Mengurutkan teks berjalan",
  "content.create": "Menambah konten",
  "content.update": "Mengubah konten",
  "content.delete": "Menghapus konten",
  "content.submit": "Mengajukan hadits ke kumpulan hadits SIWAK",
  "library.create": "Menambah ke kumpulan hadits",
  "library.update": "Mengubah kumpulan hadits",
  "library.delete": "Menghapus dari kumpulan hadits",
  "library.verify": "Memverifikasi hadits",
  "library.reject": "Mengembalikan hadits",
  "library.unverify": "Membatalkan verifikasi hadits",
  "slide.create": "Menambah slide",
  "slide.update": "Mengubah slide",
  "slide.delete": "Menghapus slide",
  "media.upload": "Mengunggah media",
  "media.delete": "Menghapus media",
  "announcement.create": "Mengirim pengumuman",
  "announcement.revoke": "Mencabut pengumuman",
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;

export const ACTION_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "Semua" },
  { id: "settings", label: "Pengaturan" },
  { id: "device", label: "TV" },
  { id: "announcement", label: "Pengumuman" },
  { id: "running_text", label: "Teks berjalan" },
  { id: "content", label: "Konten" },
  { id: "slide", label: "Slide" },
  { id: "media", label: "Media" },
];
