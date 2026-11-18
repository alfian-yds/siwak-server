import { describe, expect, it } from "vitest";
import { supportsInfoTeks } from "../src/routes/device-api.js";

describe("konten Informasi hanya dikirim ke TV yang mengenalinya", () => {
  it("rc.5 ke atas dan versi stabil 2.x: ya; rc.4 ke bawah, 1.x, atau tidak diketahui: tidak", () => {
    for (const v of ["2.0.0-rc.5", "2.0.0-rc.5-DEBUG", "2.0.0-rc.12", "2.0.0", "2.0.1", "2.1.0", "3.0.0"]) expect(supportsInfoTeks(v)).toBe(true);
    for (const v of ["2.0.0-rc.4", "2.0.0-rc.4-DEBUG", "2.0.0-rc.1", "1.3", "1.3.0", null, undefined, ""]) expect(supportsInfoTeks(v)).toBe(false);
  });
});
