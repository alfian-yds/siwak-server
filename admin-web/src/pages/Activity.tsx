import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type ActivityItem, type Page, api } from "../api";
import { ErrorAlert, Loading, PageHead } from "../components/ui";
import { ACTION_FILTERS, actionLabel } from "../labels";
import { useMosque } from "../mosque";

const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Log aktivitas satu masjid (tab Log, admin ke atas). */
export function MosqueActivityPage() {
  const { mosque } = useMosque();
  return <ActivityList base={`/api/admin/mosques/${mosque.id}/activity`} showMosque={false} />;
}

/** Log aktivitas seluruh server (super admin). */
export function GlobalActivityPage() {
  return (
    <div className="stack">
      <PageHead title="Riwayat perubahan" />
      <ActivityList base="/api/admin/activity" showMosque filters={[...ACTION_FILTERS, { id: "auth", label: "Masuk/keluar" }, { id: "user", label: "Pengguna" }, { id: "library", label: "Kumpulan hadits" }]} />
    </div>
  );
}

function ActivityList({ base, showMosque, filters = ACTION_FILTERS }: { base: string; showMosque: boolean; filters?: { id: string; label: string }[] }) {
  const [action, setAction] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["activity", base, action],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: "30" });
      if (pageParam) p.set("before", String(pageParam));
      if (action) p.set("action", action);
      return api<Page<ActivityItem>>("GET", `${base}?${p}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Setiap perubahan tercatat beserta nilai lama dan barunya. Log disimpan 1 tahun.
      </p>
      <label className="field" style={{ maxWidth: 320 }}>
        <span className="label">Jenis</span>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {filters.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorAlert error={q.error} />
      ) : (
        <>
          {q.data.pages[0]!.items.length === 0 ? (
            <div className="card empty">Belum ada aktivitas.</div>
          ) : (
            <ol className="list plain">
              {q.data.pages
                .flatMap((p) => p.items)
                .map((i) => (
                  <li key={i.id}>
                    <ActivityRow item={i} showMosque={showMosque} />
                  </li>
                ))}
            </ol>
          )}
          {q.hasNextPage && (
            <button type="button" className="btn" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              {q.isFetchingNextPage ? "Memuat…" : "Muat lebih lama"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ActivityRow({ item: i, showMosque }: { item: ActivityItem; showMosque: boolean }) {
  const [open, setOpen] = useState(false);
  const changes = diffRows(i.diff);
  return (
    <div className="card stack activity">
      <div className="tv-head">
        <div>
          <div className="row-title">{actionLabel(i.action)}</div>
          <div className="muted small">
            {fmt.format(new Date(i.at))} · {i.user ? (i.user.name ?? i.user.email) : "Sistem"}
            {showMosque && i.mosque && ` · ${i.mosque.name ?? "masjid terhapus"}`}
            {i.ip && <span className="mono"> · {i.ip}</span>}
          </div>
        </div>
        {changes.length > 0 && (
          <button type="button" className="btn btn-small" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Tutup" : "Rincian"}
          </button>
        )}
      </div>
      {open && (
        <div className="diff-wrap">
          <table className="diff small">
            <thead>
              <tr>
                <th scope="col">Isian</th>
                <th scope="col">Lama</th>
                <th scope="col">Baru</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.field}>
                  <th scope="row" className="mono">
                    {c.field}
                  </th>
                  <td>{show(c.old)}</td>
                  <td>{show(c.new)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Row = { field: string; old: unknown; new: unknown };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Bentuk diff di log: `{ "jalur.isian": { old, new } }` (pengaturan) atau `{ old: {...}, new: {...} }`
 * (entitas lain). Keduanya diratakan menjadi baris isian · lama · baru.
 */
export function diffRows(diff: unknown): Row[] {
  if (!isObj(diff)) return [];
  if ("old" in diff || "new" in diff) {
    const o = diff.old;
    const n = diff.new;
    if (isObj(o) || isObj(n)) {
      const oo = isObj(o) ? o : {};
      const nn = isObj(n) ? n : {};
      return [...new Set([...Object.keys(oo), ...Object.keys(nn)])]
        .filter((k) => JSON.stringify(oo[k]) !== JSON.stringify(nn[k]))
        .map((k) => ({ field: k, old: oo[k], new: nn[k] }));
    }
    return [{ field: "nilai", old: o, new: n }];
  }
  return Object.entries(diff).map(([field, v]) => (isObj(v) && ("old" in v || "new" in v) ? { field, old: v.old, new: v.new } : { field, old: undefined, new: v }));
}

function show(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "kosong";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? fmt.format(new Date(v)) : v;
  return JSON.stringify(v);
}
