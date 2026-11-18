import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Blocker, NavLink, Outlet, useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, type Me, type Mosque, type MosqueRole, type Settings, api } from "./api";
import { ApplyStatus } from "./components/ApplyStatus";
import { Icon, type IconName } from "./components/Icon";
import { ErrorAlert, Loading } from "./components/ui";

interface MosqueCtx {
  mosque: Mosque & { configVersion: number };
  role: MosqueRole;
  canAdmin: boolean;
}
const Ctx = createContext<MosqueCtx | null>(null);
export const useMosque = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMosque di luar MosqueLayout");
  return v;
};

export const mosqueQueryKey = (id: string) => ["mosque", id] as const;

/** Halaman di bawah /m/:id yang hanya untuk admin masjid (tugas 3.1). */
const ADMIN_PAGES = ["hubungkan", "hadits", "jadwal", "suara", "tampilan", "log"];

/** Kerangka halaman per masjid: judul, pemilih masjid, tab menu, dan data masjid untuk halaman anak. */
export function MosqueLayout() {
  const { mosqueId = "" } = useParams();
  const q = useQuery({
    queryKey: mosqueQueryKey(mosqueId),
    queryFn: () => api<{ mosque: MosqueCtx["mosque"]; role: MosqueRole }>("GET", `/api/admin/mosques/${mosqueId}`),
  });
  const value = useMemo(() => (q.data ? { ...q.data, canAdmin: q.data.role !== "operator" } : null), [q.data]);

  const { pathname } = useLocation();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorAlert error={q.error} />;
  const base = `/m/${mosqueId}`;
  const canAdmin = value!.canAdmin;
  const groups = menuGroups(canAdmin);
  const current = pathname.split("/")[3] ?? "";
  const active = groups.find((g) => g.pages.some((p) => p.path === current)) ?? groups[0]!;
  return (
    <Ctx.Provider value={value}>
      <div className="mosque-head">
        <div className="muted small">{value!.mosque.regionLabel ?? "Masjid"}</div>
        <h1>{value!.mosque.name}</h1>
        <MosquePicker current={mosqueId} />
      </div>
      <nav className="tabs" aria-label="Menu masjid">
        {groups.map((g) => (
          <NavLink key={g.label} to={g.pages[0]!.path ? `${base}/${g.pages[0]!.path}` : base} end className={() => (g === active ? "active" : "")}>
            <Icon name={g.icon} size={18} />
            {g.label}
          </NavLink>
        ))}
      </nav>
      {active.pages.filter((p) => !p.hidden).length > 1 && (
        <nav className="subtabs" aria-label={`Menu ${active.label}`}>
          {active.pages
            .filter((p) => !p.hidden)
            .map((p) => (
              <NavLink key={p.path} to={p.path ? `${base}/${p.path}` : base} end>
                {p.icon && <Icon name={p.icon} size={16} />}
                {p.label}
              </NavLink>
            ))}
        </nav>
      )}
      <ApplyStatus mosqueId={mosqueId} />
      <Outlet />
    </Ctx.Provider>
  );
}

interface MenuPage {
  path: string;
  label: string;
  icon?: IconName;
  hidden?: boolean;
}
/**
 * Menu masjid dikelompokkan agar tidak berderet panjang: Beranda (status TV), Konten (yang tampil di layar),
 * Pengaturan (jadwal, suara, tampilan, riwayat; khusus admin), dan Pratinjau. Urutan Jadwal, Suara, Tampilan
 * sama dengan menu Pengaturan di aplikasi TV.
 */
function menuGroups(canAdmin: boolean): { label: string; icon: IconName; pages: MenuPage[] }[] {
  const groups: { label: string; icon: IconName; pages: MenuPage[] }[] = [
    {
      label: "Beranda",
      icon: "home",
      pages: [
        { path: "", label: "Beranda" },
        { path: "hubungkan", label: "Hubungkan TV", hidden: true },
      ],
    },
    {
      label: "Konten",
      icon: "layers",
      pages: [
        { path: "pengumuman", label: "Pengumuman", icon: "megaphone" },
        { path: "teks", label: "Teks berjalan", icon: "ticker" },
        { path: "konten", label: "Slide", icon: "slides" },
        ...(canAdmin ? [{ path: "hadits", label: "Hadits", icon: "book" as IconName }] : []),
      ],
    },
  ];
  if (canAdmin) {
    groups.push({
      label: "Pengaturan",
      icon: "settings",
      pages: [
        { path: "jadwal", label: "Jadwal", icon: "calendar" },
        { path: "suara", label: "Suara", icon: "volume" },
        { path: "tampilan", label: "Tampilan", icon: "palette" },
        { path: "log", label: "Riwayat perubahan", icon: "history" },
      ],
    });
  }
  groups.push({ label: "Pratinjau", icon: "eye", pages: [{ path: "pratinjau", label: "Pratinjau" }] });
  return groups;
}

/**
 * Pemilih masjid bagi pengguna dengan lebih dari satu masjid (App Flow §4.1). Pindah masjid tetap di
 * halaman yang sama bila peran di masjid tujuan mengizinkan; bila tidak, ke halaman TV.
 */
function MosquePicker({ current }: { current: string }) {
  const qc = useQueryClient();
  const me = qc.getQueryData<Me>(["me"]);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const all = useQuery({
    queryKey: ["mosques", "0"],
    queryFn: () => api<{ mosques: Mosque[] }>("GET", "/api/admin/mosques"),
    enabled: Boolean(me?.user.isSuperAdmin),
  });
  if (!me) return null;
  const options: { id: string; name: string; role: MosqueRole }[] = me.user.isSuperAdmin
    ? (all.data?.mosques ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        role: "super" as const,
      }))
    : me.memberships.map((m) => ({
        id: m.mosqueId,
        name: m.mosqueName,
        role: m.role,
      }));
  if (options.length < 2) return null;
  const sub = pathname.split("/").slice(3).join("/"); // bagian setelah /m/:id
  return (
    <label className="mosque-picker">
      <span className="muted small">Pindah masjid</span>
      <select
        value={current}
        onChange={(e) => {
          const target = options.find((o) => o.id === e.target.value);
          if (!target) return;
          const keep = sub && !(target.role === "operator" && ADMIN_PAGES.includes(sub.split("/")[0]!));
          navigate(`/m/${target.id}${keep ? `/${sub}` : ""}`);
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.role === "operator" ? " (operator)" : o.role === "admin" ? " (admin)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Pembungkus halaman khusus admin: operator melihat penjelasan, bukan formulir yang pasti ditolak. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { canAdmin } = useMosque();
  if (canAdmin) return <>{children}</>;
  return (
    <div className="card empty" role="alert">
      Halaman ini hanya untuk admin masjid. Hubungi admin masjid atau super admin bila perlu mengubahnya.
    </div>
  );
}

const clone = <T,>(v: T): T => structuredClone(v);

/**
 * Formulir pengaturan masjid: menyimpan salinan kerja, menandai perubahan, menyimpan dokumen lengkap,
 * dan meminta konfirmasi bila meninggalkan halaman sebelum menyimpan (App Flow §4.4).
 */
export function useSettingsForm(mosqueId: string) {
  const qc = useQueryClient();
  const key = ["settings", mosqueId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<{ settings: Settings; updatedAt: string | null }>("GET", `/api/admin/mosques/${mosqueId}/settings`),
  });
  const [draft, setDraftState] = useState<Settings | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (q.data && !draft) setDraftState(clone(q.data.settings));
  }, [q.data, draft]);

  const dirty = Boolean(draft && q.data && JSON.stringify(draft) !== JSON.stringify(q.data.settings));

  const save = useMutation({
    mutationFn: (settings: Settings) => api<{ settings: Settings; updatedAt: string }>("PUT", `/api/admin/mosques/${mosqueId}/settings`, { settings }),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      setDraftState(clone(data.settings));
      setSavedAt(Date.now());
      void qc.invalidateQueries({ queryKey: ["devices", mosqueId] });
    },
  });

  /** Ubah salinan kerja lewat fungsi yang memodifikasi objek salinan. */
  const update = useCallback(
    (fn: (s: Settings) => void) => {
      setSavedAt(null);
      save.reset();
      setDraftState((d) => {
        if (!d) return d;
        const next = clone(d);
        fn(next);
        return next;
      });
    },
    [save],
  );

  const reset = () => {
    if (q.data) setDraftState(clone(q.data.settings));
    save.reset();
  };

  const blocker = useUnsavedGuard(dirty);

  const fields = save.error instanceof ApiError ? save.error.fields : {};
  return {
    query: q,
    draft,
    update,
    dirty,
    save: () => draft && save.mutate(draft),
    saving: save.isPending,
    error: save.error,
    fields,
    savedAt,
    reset,
    blocker,
  };
}

/** Konfirmasi di halaman saat berpindah menu (lihat LeaveGuard), dan peringatan peramban saat menutup tab. */
export function useUnsavedGuard(dirty: boolean): Blocker {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  return blocker;
}

/** Konfirmasi di halaman (bukan dialog peramban) saat meninggalkan perubahan yang belum disimpan. */
export function LeaveGuard({ blocker }: { blocker: Blocker }) {
  if (blocker.state !== "blocked") return null;
  return (
    <div className="overlay" role="alertdialog" aria-modal="true" aria-labelledby="leave-title">
      <div className="card stack dialog">
        <h2 id="leave-title">Tinggalkan halaman?</h2>
        <p className="muted" style={{ margin: 0 }}>
          Perubahan yang belum disimpan akan hilang.
        </p>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => blocker.reset()} autoFocus>
            Tetap di sini
          </button>
          <button className="btn btn-ghost-danger" onClick={() => blocker.proceed()}>
            Tinggalkan
          </button>
        </div>
      </div>
    </div>
  );
}
