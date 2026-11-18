import { useInfiniteQuery } from "@tanstack/react-query";
import { type DeviceEvent, type Page, api } from "../api";
import { eventText } from "../labels";
import { ErrorAlert, Loading } from "./ui";

const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const tone: Partial<Record<DeviceEvent["type"], string>> = {
  offline: "bad",
  error: "bad",
  clock_drift: "warn",
  app_background: "warn",
  online: "ok",
  app_foreground: "ok",
};

/** Riwayat kejadian satu TV, terbaru dulu (F-ADM-16). */
export function DeviceEvents({ deviceId }: { deviceId: string }) {
  const q = useInfiniteQuery({
    queryKey: ["device-events", deviceId],
    queryFn: ({ pageParam }) => api<Page<DeviceEvent>>("GET", `/api/admin/devices/${deviceId}/events?limit=20${pageParam ? `&before=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorAlert error={q.error} />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (items.length === 0) return <div className="muted small">Belum ada kejadian.</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <ol className="events">
        {items.map((e) => (
          <li key={e.id} className={`event event-${tone[e.type] ?? "muted"}`}>
            <time className="mono small">{fmt.format(new Date(e.at))}</time>
            <span>{eventText(e)}</span>
          </li>
        ))}
      </ol>
      {q.hasNextPage && (
        <button type="button" className="btn btn-small" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {q.isFetchingNextPage ? "Memuat…" : "Muat lebih lama"}
        </button>
      )}
    </div>
  );
}
