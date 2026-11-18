import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type Me, type Mosque, type Role, type User, api } from "../api";
import { ConfirmAction, ErrorAlert, Field, Loading, PageHead, fieldErrors, formatDateTime } from "../components/ui";

type Kind = "super" | "pengurus";
interface Row {
  mosqueId: string;
  role: Role;
}

export function UserFormPage({ me }: { me: Me }) {
  const { id } = useParams();
  const isNew = !id;
  const isSelf = id === me.user.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const users = useQuery({ queryKey: ["users"], enabled: !isNew, queryFn: () => api<{ users: User[] }>("GET", "/api/admin/users") });
  const mosques = useQuery({ queryKey: ["mosques", "0"], queryFn: () => api<{ mosques: Mosque[] }>("GET", "/api/admin/mosques") });
  const user = users.data?.users.find((u) => u.id === id);

  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<Kind>("pengurus");
  const [rows, setRows] = useState<Row[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setKind(user.isSuperAdmin ? "super" : "pengurus");
      setRows(user.memberships.map(({ mosqueId, role }) => ({ mosqueId, role })));
    }
  }, [user]);

  const invalidate = () => Promise.all([qc.invalidateQueries({ queryKey: ["users"] }), qc.invalidateQueries({ queryKey: ["mosques"] })]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isNew ? api<{ user: User }>("POST", "/api/admin/users", body) : api<{ user: User }>("PATCH", `/api/admin/users/${id}`, body),
    onSuccess: async () => {
      await invalidate();
      if (isNew) navigate("/pengguna");
      else setSaved(true);
    },
  });
  const setStatus = useMutation({
    mutationFn: (status: User["status"]) => api<{ user: User }>("PATCH", `/api/admin/users/${id}`, { status }),
    onSuccess: invalidate,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const memberships = kind === "super" ? rows.filter((r) => r.mosqueId) : rows;
    if (kind === "pengurus" && memberships.length === 0) {
      setLocalError("Pilih minimal satu masjid untuk pengurus.");
      return;
    }
    if (memberships.some((r) => !r.mosqueId)) {
      setLocalError("Ada baris masjid yang belum dipilih.");
      return;
    }
    const body = { isSuperAdmin: kind === "super", memberships };
    save.mutate(isNew ? { email: email.trim(), ...body } : body);
  }

  const changeRows = (next: Row[]) => {
    setSaved(false);
    setRows(next);
  };

  if (mosques.isPending || (!isNew && users.isPending)) return <Loading />;
  if (mosques.isError) return <ErrorAlert error={mosques.error} />;
  if (users.isError) return <ErrorAlert error={users.error} />;
  if (!isNew && !user) return <PageHead title="Pengguna tidak ditemukan" back={{ to: "/pengguna", label: "Pengguna" }} />;

  const errors = fieldErrors(save.error);
  const allMosques = mosques.data.mosques;
  const used = new Set(rows.map((r) => r.mosqueId));

  return (
    <div className="stack">
      <PageHead title={isNew ? "Tambah pengguna" : (user!.name ?? user!.email)} back={{ to: "/pengguna", label: "Pengguna" }} />

      <form className="card stack" onSubmit={onSubmit} noValidate>
        {isNew ? (
          <Field label="Email Google" hint="Pengguna masuk dengan akun Google yang memakai email ini." error={errors.email}>
            {(p) => (
              <input {...p} type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@gmail.com" />
            )}
          </Field>
        ) : (
          <div className="field">
            <span className="label">Email</span>
            <div className="mono">{user!.email}</div>
            <div className="muted small">
              {user!.lastLoginAt ? `Terakhir masuk ${formatDateTime(user!.lastLoginAt)}` : "Belum pernah masuk"}
            </div>
          </div>
        )}

        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ fontWeight: 600, marginBottom: 6 }}>
            Peran
          </legend>
          <label className="choice">
            <input type="radio" name="kind" checked={kind === "pengurus"} disabled={isSelf} onChange={() => (setSaved(false), setKind("pengurus"))} />
            <span>
              <strong>Pengurus masjid</strong>
              <div className="muted small">Admin atau operator di masjid yang dipilih.</div>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="kind" checked={kind === "super"} onChange={() => (setSaved(false), setKind("super"))} />
            <span>
              <strong>Super admin</strong>
              <div className="muted small">Mengelola semua masjid, pengguna, dan kumpulan hadits SIWAK.</div>
            </span>
          </label>
          {isSelf && <div className="muted small">Anda tidak bisa mencabut status super admin akun sendiri.</div>}
        </fieldset>

        <section className="stack">
          <div>
            <div style={{ fontWeight: 600 }}>Masjid</div>
            <div className="muted small">
              {kind === "super"
                ? "Opsional. Super admin bisa mengelola semua masjid; isi bila ia juga pengurus masjid tertentu."
                : "Admin mengatur semua hal di masjid. Operator mengatur konten harian (teks berjalan, pengumuman)."}
            </div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="membership-row">
              <select
                aria-label={`Masjid ${i + 1}`}
                aria-invalid={Boolean(errors[`memberships.${i}.mosqueId`])}
                value={r.mosqueId}
                onChange={(e) => changeRows(rows.map((x, j) => (j === i ? { ...x, mosqueId: e.target.value } : x)))}
              >
                <option value="">Pilih masjid…</option>
                {allMosques
                  .filter((m) => m.id === r.mosqueId || !used.has(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                {r.mosqueId && !allMosques.some((m) => m.id === r.mosqueId) && (
                  <option value={r.mosqueId}>{user?.memberships.find((m) => m.mosqueId === r.mosqueId)?.mosqueName ?? "Masjid diarsipkan"}</option>
                )}
              </select>
              <select
                aria-label={`Peran di masjid ${i + 1}`}
                value={r.role}
                onChange={(e) => changeRows(rows.map((x, j) => (j === i ? { ...x, role: e.target.value as Role } : x)))}
              >
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
              </select>
              <button type="button" className="btn btn-small" onClick={() => changeRows(rows.filter((_, j) => j !== i))}>
                Hapus
              </button>
              {errors[`memberships.${i}.mosqueId`] && <div className="error small">{errors[`memberships.${i}.mosqueId`]}</div>}
            </div>
          ))}
          {allMosques.length === 0 ? (
            <div className="muted small">Belum ada masjid. Tambahkan masjid terlebih dahulu di menu Masjid.</div>
          ) : (
            rows.length < allMosques.length && (
              <div>
                <button type="button" className="btn btn-small" onClick={() => changeRows([...rows, { mosqueId: "", role: "admin" }])}>
                  + Tambah masjid
                </button>
              </div>
            )
          )}
        </section>

        {localError && <div className="alert alert-error" role="alert">{localError}</div>}
        {save.isError && !errors.email && <ErrorAlert error={save.error} />}
        {saved && <div className="alert alert-ok">Perubahan tersimpan.</div>}

        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : isNew ? "Tambah pengguna" : "Simpan"}
          </button>
        </div>
      </form>

      {!isNew && !isSelf && (
        <section className="card stack">
          <h2>{user!.status === "active" ? "Nonaktifkan akun" : "Aktifkan akun"}</h2>
          <p className="muted small" style={{ margin: 0 }}>
            {user!.status === "active"
              ? "Pengguna langsung keluar dari semua perangkat dan tidak bisa masuk lagi sampai diaktifkan."
              : "Akun ini nonaktif. Aktifkan agar pengguna bisa masuk lagi."}
          </p>
          <ErrorAlert error={setStatus.error} />
          {setStatus.isSuccess && (
            <div className="alert alert-ok">{user!.status === "active" ? "Akun diaktifkan lagi." : "Akun dinonaktifkan."}</div>
          )}
          {user!.status === "active" ? (
            <ConfirmAction
              key="disable"
              label="Nonaktifkan"
              question={`Nonaktifkan ${user!.email}?`}
              confirmLabel="Ya, nonaktifkan"
              busy={setStatus.isPending}
              onConfirm={() => setStatus.mutate("disabled")}
            />
          ) : (
            <ConfirmAction
              key="enable"
              label="Aktifkan"
              question={`Aktifkan lagi ${user!.email}?`}
              confirmLabel="Ya, aktifkan"
              danger={false}
              busy={setStatus.isPending}
              onConfirm={() => setStatus.mutate("active")}
            />
          )}
        </section>
      )}
    </div>
  );
}
