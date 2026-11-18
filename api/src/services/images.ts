/**
 * Pemrosesan gambar unggahan (TRD §9): ubah ke WebP, sisi terpanjang maks. 1920 px.
 * Menulis ulang piksel otomatis membuang metadata EXIF (termasuk lokasi GPS).
 * Memakai jimp + codec WebP WebAssembly (MIT/Apache-2.0), tanpa modul native.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createJimp } from "@jimp/core";
import decodeWebp, { init as initWebpDecoder } from "@jsquash/webp/decode.js";
import encodeWebp, { init as initWebpEncoder } from "@jsquash/webp/encode.js";
import { defaultFormats, defaultPlugins } from "jimp";

const require = createRequire(import.meta.url);

/** Format WebP untuk jimp. Codec diinisialisasi oleh initCodecs() sebelum dipakai. */
const webpFormat = () => ({
  mime: "image/webp" as const,
  hasAlpha: true,
  encode: async (bitmap: { data: Buffer; width: number; height: number }, options: { quality?: number } = {}) => {
    await initCodecs();
    const out = await encodeWebp(
      { data: new Uint8ClampedArray(bitmap.data), width: bitmap.width, height: bitmap.height, colorSpace: "srgb" },
      { quality: options.quality ?? 82 },
    );
    return Buffer.from(out);
  },
  decode: async (data: Buffer) => {
    await initCodecs();
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const img = await decodeWebp(ab);
    return { data: Buffer.from(img.data), width: img.width, height: img.height };
  },
});

const Jimp = createJimp({ formats: [...defaultFormats, webpFormat], plugins: defaultPlugins });

let ready: Promise<void> | null = null;
/** Codec WebP memuat WASM lewat fetch(file://) yang tidak didukung Node; dimuat manual dari disk. */
function initCodecs(): Promise<void> {
  ready ??= (async () => {
    const wasm = (name: string) => WebAssembly.compile(readFileSync(require.resolve(`@jsquash/webp/codec/${name}`)));
    const { simd } = await import("wasm-feature-detect");
    await initWebpEncoder(await wasm((await simd()) ? "enc/webp_enc_simd.wasm" : "enc/webp_enc.wasm"));
    await initWebpDecoder(await wasm("dec/webp_dec.wasm"));
  })();
  return ready;
}

export const MAX_IMAGE_SIDE = 1920;

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
  mime: "image/webp";
}

export async function toWebp(input: Buffer, maxSide = MAX_IMAGE_SIDE): Promise<ProcessedImage> {
  await initCodecs();
  const img = await Jimp.read(input);
  if (img.width > maxSide || img.height > maxSide) img.scaleToFit({ w: maxSide, h: maxSide });
  const data = await img.getBuffer("image/webp", { quality: 82 } as never);
  return { data: Buffer.from(data), width: img.width, height: img.height, mime: "image/webp" };
}
