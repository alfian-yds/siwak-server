import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { type Me, type User, api } from "../api";
import { ErrorAlert, Loading, PageHead, formatDateTime } from "../components/ui";

const roleLabel = { admin: "Admin", operator: "Operator" } as const;

export function UsersPage({ me }: { me: Me }) {
  const q = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: User[] }>("GET", "/api/admin/users") });

  return (
    <div className="stack">
      <PageHead
        title="Pengguna"
        action={
          <Link className="btn btn-primary" to="/pengguna/baru">
            Tambah pengguna
          </Link>
        }
      />
      <p className="muted small" style={{ margin: 0 }}>
        Hanya email Google yang terdaftar di sini yang bisa masuk ke admin SIWAK.
      </p>

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorAlert error={q.error} />
      ) : (
        <div className="list">
          {q.data.users.map((u) => (
            <Link key={u.id} className="row-link" to={`/pengguna/${u.id}`}>
              <div className="card">
                <div className="row-title">
                  {u.name ?? u.email}
                  {u.id === me.user.id && <span className="badge">Anda</span>}
                </div>
                {u.name && <div className="muted small">{u.email}</div>}
                <div className="badges">
                  {u.status === "disabled" && <span className="badge badge-danger">Nonaktif</span>}
                  {u.isSuperAdmin && <span className="badge badge-accent">Super admin</span>}
                  {u.memberships.map((m) => (
                    <span key={m.mosqueId} className="badge">
                      {roleLabel[m.role]} · {m.mosqueName}
                    </span>
                  ))}
                  {!u.isSuperAdmin && u.memberships.length === 0 && <span className="badge">Belum ada masjid</span>}
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  {u.lastLoginAt ? `Terakhir masuk ${formatDateTime(u.lastLoginAt)}` : "Belum pernah masuk"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
