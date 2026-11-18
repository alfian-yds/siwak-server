import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Admin web disajikan server di /admin/. Saat `npm run dev -w admin-web`, permintaan API dan login
// diteruskan ke server lokal (npm run dev) di port 8080.
const api = "http://localhost:8080";

export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  // emptyOutDir: false — berkas aset lama (nama ber-hash) tetap ada selama deploy, sehingga tab yang
  // masih terbuka atau server lama yang belum dimuat ulang tidak menampilkan halaman kosong.
  build: { outDir: "dist", emptyOutDir: false, sourcemap: false },
  server: {
    port: 5173,
    proxy: { "/api": api, "/auth": api, "/admin/login": api },
  },
});
