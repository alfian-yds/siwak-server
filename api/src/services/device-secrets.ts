import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";

/** Angka acak kriptografis sepanjang n digit, boleh diawali 0. */
export const randomDigits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");

export const sha256Hex = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** Kunci perangkat: 32 byte acak, base64url (TRD §5.2). Server hanya menyimpan hash-nya. */
export const newDeviceToken = () => randomBytes(32).toString("base64url");

export interface PinRecord {
  pinCiphertext: string;
  pinSalt: string;
  pinHash: string;
}

/**
 * PIN TV 6 digit (TRD §10): disimpan terenkripsi AES-256-GCM agar bisa ditampilkan lagi di admin web;
 * TV hanya menerima salt + SHA-256(salt || PIN).
 */
export function makePin(keyB64: string, pin = randomDigits(6)): PinRecord & { pin: string } {
  const key = Buffer.from(keyB64, "base64").subarray(0, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const pinSalt = randomBytes(16).toString("hex");
  return {
    pin,
    pinCiphertext: Buffer.concat([iv, tag, data]).toString("base64"),
    pinSalt,
    pinHash: sha256Hex(pinSalt + pin),
  };
}

export function readPin(keyB64: string, ciphertext: string): string {
  const key = Buffer.from(keyB64, "base64").subarray(0, 32);
  const raw = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
