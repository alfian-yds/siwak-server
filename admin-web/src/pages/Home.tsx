import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { type Me, type Mosque, type User, api } from "../api";

const roleLabel = { admin: "Admin masjid", operator: "Operator" } as const;

export function HomePage({ me }: { me: Me }) {
  const { user, memberships } = me;
  const firstName = (user.name ?? user.email).split(/[\s@]/)[0];

  return (
    <div className="stack">
      <div>
        <h1>Assalamu'alaikum, {firstName}</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {user.isSuperAdmin ? "Anda masuk sebagai super admin." : "Kelola layar masjid Anda dari sini."}
        </p>
      </div>

      {user.isSuperAdmin && <SuperAdminSummary />}

      {user.isSuperAdmin && <AllMosques />}

      {user.isSuperAdmin && memberships.length === 0 ? null : (
      <section className="stack">
        <h2>{user.isSuperAdmin ? "Anda juga pengurus di" : "Masjid Anda"}</h2>
        {memberships.length === 0 ? (
          <div className="card muted">Akun Anda belum ditautkan ke masjid. Hubungi super admin.</div>
        ) : (
          <div className="list">
            {memberships.map((m) => (
              <Link key={m.mosqueId} className="row-link" to={`/m/${m.mosqueId}`}>
                <div className="card">
                  <div className="row-title">{m.mosqueName}</div>
                  <div className="badges">
                    <span className="badge badge-accent">{roleLabel[m.role]}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  );
}

/** Super admin: semua masjid sebagai pintasan ke halaman masjid. */
function AllMosques() {
  const q = useQuery({ queryKey: ["mosques", "0"], queryFn: () => api<{ mosques: Mosque[] }>("GET", "/api/admin/mosques") });
  if (!q.data || q.data.mosques.length === 0) return null;
  return (
    <section className="stack">
      <h2>Semua masjid</h2>
      <div className="list">
        {q.data.mosques.map((m) => (
          <Link key={m.id} className="row-link" to={`/m/${m.id}`}>
            <div className="card">
              <div className="row-title">{m.name}</div>
              <div className="muted small">
                {m.regionLabel ?? "—"} · {m.deviceCount} TV
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SuperAdminSummary() {
  const mosques = useQuery({ queryKey: ["mosques", "0"], queryFn: () => api<{ mosques: Mosque[] }>("GET", "/api/admin/mosques") });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: User[] }>("GET", "/api/admin/users") });
  const tvCount = mosques.data?.mosques.reduce((n, m) => n + m.deviceCount, 0);
  const activeUsers = users.data?.users.filter((u) => u.status === "active").length;

  return (
    <div className="stats">
      <Link className="stat card" to="/masjid">
        <div className="num">{mosques.data?.mosques.length ?? "–"}</div>
        <div className="muted small">Masjid aktif</div>
      </Link>
      <Link className="stat card" to="/pengguna">
        <div className="num">{activeUsers ?? "–"}</div>
        <div className="muted small">Pengguna aktif</div>
      </Link>
      <div className="stat card">
        <div className="num">{tvCount ?? "–"}</div>
        <div className="muted small">TV terhubung</div>
      </div>
      <Link className="stat card" to="/masjid/baru">
        <div className="num" aria-hidden="true">
          +
        </div>
        <div className="muted small">Tambah masjid</div>
      </Link>
    </div>
  );
}
