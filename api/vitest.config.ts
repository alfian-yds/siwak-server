import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // Uji yang memakai basis data berbagi satu basis data uji, jadi dijalankan berurutan.
    fileParallelism: false,
  },
});
