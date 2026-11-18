import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { type Mosque, api } from "../api";
import { ErrorAlert, Loading, PageHead, timezoneLabel } from "../components/ui";

export function MosquesPage() {
  const [archived, setArchived] = useState(false);
  const flag = archived ? "1" : "0";
  const q = useQuery({
    queryKey: ["mosques", flag],
    queryFn: () => api<{ mosques: Mosque[] }>("GET", `/api/admin/mosques?archived=${flag}`),
  });

  return (
    <div className="stack">
      <PageHead
        title={archived ? "Masjid diarsipkan" : "Masjid"}
        action={
          !archived && (
            <Link className="btn btn-primary" to="/masjid/baru">
              Tambah masjid
            </Link>
          )
        }
      />
      <div>
        <button type="button" className="btn btn-small" onClick={() => setArchived(!archived)}>
          {archived ? "← Kembali ke masjid aktif" : "Lihat arsip"}
        </button>
      </div>

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorAlert error={q.error} />
      ) : q.data.mosques.length === 0 ? (
        <div className="card empty">
          {archived ? "Tidak ada masjid yang diarsipkan." : "Belum ada masjid. Tekan Tambah masjid untuk memulai."}
        </div>
      ) : (
        <div className="list">
          {q.data.mosques.map((m) => (
            <Link key={m.id} className="row-link" to={`/masjid/${m.id}`}>
              <div className="card">
                <div className="row-title">{m.name}</div>
                <div className="muted small">
                  {m.regionLabel ? `${m.regionLabel} · ` : ""}
                  <span className="mono">
                    {m.latitude.toFixed(4)}, {m.longitude.toFixed(4)}
                  </span>{" "}
                  · {timezoneLabel(m.timezone)}
                </div>
                <div className="badges">
                  <span className="badge">{m.deviceCount} TV</span>
                  <span className="badge">{m.memberCount} pengurus</span>
                  {m.archivedAt && <span className="badge badge-danger">Diarsipkan</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
