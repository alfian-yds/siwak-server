// Konfigurasi PM2 untuk server SIWAK.
// Pakai: pm2 start deploy/ecosystem.config.cjs && pm2 save
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "siwak",
      cwd: path.join(__dirname, "..", "api"),
      script: "dist/index.js",
      // Node 22+ dibutuhkan. Bila Node bawaan sistem lebih lama (dipakai aplikasi lain), deploy.sh
      // mengisi SIWAK_NODE dengan Node dari nvm sehingga hanya SIWAK yang memakainya.
      interpreter: process.env.SIWAK_NODE || "node",
      node_args: "--env-file=../.env",
      // Satu proses saja: pekerjaan latar (cuaca, deteksi offline) berjalan di dalam proses ini
      // dan tidak boleh berjalan ganda.
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      time: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
