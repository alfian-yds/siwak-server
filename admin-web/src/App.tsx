import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { type Me, getMe, setCsrfToken } from "./api";
import { Shell } from "./components/Shell";
import { ErrorAlert, Loading } from "./components/ui";
import { AdminOnly, MosqueLayout } from "./mosque";
import { GlobalActivityPage, MosqueActivityPage } from "./pages/Activity";
import { AnnouncementsPage } from "./pages/Announcements";
import { DashboardPage } from "./pages/Dashboard";
import { ConnectTvPage } from "./pages/ConnectTv";
import { ContentPage } from "./pages/Content";
import { LibraryPage, MosqueHadithPage } from "./pages/Hadith";
import { HomePage } from "./pages/Home";
import { MosqueFormPage } from "./pages/MosqueForm";
import { MosqueTvPage } from "./pages/MosqueTv";
import { PreviewPage } from "./pages/Preview";
import { MosquesPage } from "./pages/Mosques";
import { RunningTextsPage } from "./pages/RunningTexts";
import { DisplayPage, SchedulePage, SoundPage } from "./pages/SettingsPages";
import { UserFormPage } from "./pages/UserForm";
import { UsersPage } from "./pages/Users";

function buildRouter(me: Me) {
  const superRoutes = me.user.isSuperAdmin
    ? [
        { path: "masjid", element: <MosquesPage /> },
        { path: "masjid/baru", element: <MosqueFormPage /> },
        { path: "masjid/:id", element: <MosqueFormPage /> },
        { path: "pengguna", element: <UsersPage me={me} /> },
        { path: "pengguna/baru", element: <UserFormPage me={me} /> },
        { path: "pengguna/:id", element: <UserFormPage me={me} /> },
        { path: "pustaka", element: <LibraryPage /> },
        { path: "log", element: <GlobalActivityPage /> },
      ]
    : [];
  // Pengurus satu masjid langsung masuk ke masjidnya (App Flow §4.1).
  const only = !me.user.isSuperAdmin && me.memberships.length === 1 ? me.memberships[0]!.mosqueId : null;
  return createBrowserRouter(
    [
      {
        element: <Shell me={me} />,
        children: [
          { index: true, element: only ? <Navigate to={`/m/${only}`} replace /> : <HomePage me={me} /> },
          { path: "semua-tv", element: <DashboardPage /> },
          {
            path: "m/:mosqueId",
            element: <MosqueLayout />,
            children: [
              { index: true, element: <MosqueTvPage /> },
              { path: "teks", element: <RunningTextsPage /> },
              { path: "konten", element: <ContentPage /> },
              { path: "pengumuman", element: <AnnouncementsPage /> },
              { path: "pratinjau", element: <PreviewPage /> },
              // Halaman admin: operator yang membuka alamatnya langsung melihat pesan, server juga menolak (tugas 3.1).
              { path: "hubungkan", element: <AdminOnly><ConnectTvPage /></AdminOnly> },
              { path: "hadits", element: <AdminOnly><MosqueHadithPage /></AdminOnly> },
              { path: "jadwal", element: <AdminOnly><SchedulePage /></AdminOnly> },
              { path: "suara", element: <AdminOnly><SoundPage /></AdminOnly> },
              { path: "tampilan", element: <AdminOnly><DisplayPage /></AdminOnly> },
              { path: "log", element: <AdminOnly><MosqueActivityPage /></AdminOnly> },
            ],
          },
          ...superRoutes,
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
    { basename: "/admin" },
  );
}

export function App() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const data = await getMe();
      setCsrfToken(data.csrfToken);
      return data;
    },
    staleTime: 5 * 60_000,
  });
  const router = useMemo(() => (me.data ? buildRouter(me.data) : null), [me.data]);

  if (me.isPending) {
    return (
      <main className="main">
        <Loading />
      </main>
    );
  }
  if (me.isError || !router) {
    return (
      <main className="main stack">
        <ErrorAlert error={me.error} />
        <button className="btn" onClick={() => me.refetch()}>
          Coba lagi
        </button>
      </main>
    );
  }
  return <RouterProvider router={router} />;
}
