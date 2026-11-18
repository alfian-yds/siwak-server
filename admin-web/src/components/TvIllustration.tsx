/**
 * Ilustrasi periode untuk pratinjau (Design Brief §7) — padanan SVG dari IllustrationRenderer di TV.
 * Bidang 400×225, digambar dengan bentuk yang sama agar pratinjau mirip layar TV.
 */
export type Period = "FAJAR" | "SIANG" | "SENJA" | "MALAM";

const SKIES: Record<Period, [string, string, string, string]> = {
  FAJAR: ["#1B2A55", "#A9587D", "#F2B47C", "#130F24"],
  SIANG: ["#2F6F9F", "#8FC0DB", "#EFE1BD", "#123A2B"],
  SENJA: ["#2B1F4F", "#B9566C", "#F0A75E", "#1A0F1D"],
  MALAM: ["#06162A", "#0D3550", "#124A3C", "#04100B"],
};

/** Umur bulan ≈ tanggal Hijriah + 0,5 hari (sama dengan MoonPhase di TV). */
export function moonIllumination(hijriDay: number) {
  const f = Math.min(1, Math.max(0, (Math.min(30, Math.max(1, hijriDay)) + 0.5) / 29.53));
  return { illum: (1 - Math.cos(2 * Math.PI * f)) / 2, waxing: f < 0.5 };
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const STARS = (() => {
  const r = rng(42);
  return Array.from({ length: 70 }, () => ({ x: r() * 400, y: r() * 120, s: 0.5 + r() }));
})();

function Windows({ lit, xs, y, w, h }: { lit: boolean; xs: number[]; y: number; w: number; h: number }) {
  if (!lit) return null;
  return (
    <>
      {xs.map((x) => (
        <path key={x} d={`M${x} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + h}Z`} fill="#F6C66B" opacity={0.85} />
      ))}
    </>
  );
}

function Moon({ day }: { day: number }) {
  const { illum, waxing } = moonIllumination(day);
  const cx = 318, cy = 52, r = 15;
  const rx = r * Math.abs(1 - 2 * illum);
  const gibbous = illum > 0.5;
  // Tepi terang lalu garis terminator (elips) kembali ke atas.
  const edgeSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (gibbous ? 1 : 0) : gibbous ? 0 : 1;
  const d = `M${cx} ${cy - r}A${r} ${r} 0 0 ${edgeSweep} ${cx} ${cy + r}A${rx} ${r} 0 0 ${termSweep} ${cx} ${cy - r}Z`;
  return (
    <>
      <circle cx={cx} cy={cy} r={r * 2.2} fill="#FFF3C9" opacity={0.1} />
      <circle cx={cx} cy={cy} r={r} fill="#8A93A6" opacity={0.25} />
      {illum > 0.01 && <path d={d} fill="#FFF6D8" />}
    </>
  );
}

function Silhouette({ kind, c, lit }: { kind: string; c: string; lit: boolean }) {
  if (kind === "TUMPANG") {
    const roof = (y: number, t: number, b: number, h: number) => `M${200 - t} ${y}H${200 + t}L${200 + b} ${y + h}H${200 - b}Z`;
    return (
      <g fill={c}>
        <rect x={0} y={205} width={400} height={20} />
        <path d={roof(150, 70, 120, 22)} />
        <rect x={140} y={166} width={120} height={6} />
        <path d={roof(118, 40, 78, 22)} />
        <rect x={160} y={134} width={80} height={18} />
        <path d={roof(90, 12, 46, 22)} />
        <rect x={176} y={106} width={48} height={14} />
        <path d="M193 90Q200 66 207 90Z" />
        <rect x={98} y={172} width={204} height={35} />
        <Windows lit={lit} xs={[118, 142, 166, 222, 246, 270]} y={180} w={10} h={20} />
        <Windows lit={lit} xs={[190]} y={178} w={20} h={29} />
      </g>
    );
  }
  if (kind === "MUSHOLLA") {
    return (
      <g fill={c}>
        <rect x={0} y={205} width={400} height={20} />
        <rect x={140} y={160} width={120} height={47} />
        <path d="M128 162L200 128L272 162Z" />
        <path d="M188 134C188 112 212 112 212 134Z" />
        <rect x={199.4} y={104} width={1.2} height={10} />
        <circle cx={200} cy={103} r={2.5} />
        <Windows lit={lit} xs={[156, 228]} y={172} w={12} h={22} />
        <Windows lit={lit} xs={[190]} y={170} w={20} h={37} />
      </g>
    );
  }
  return (
    <g fill={c}>
      <rect x={0} y={205} width={400} height={20} />
      {[118, 270].map((mx) => (
        <g key={mx}>
          <rect x={mx} y={95} width={12} height={112} />
          <rect x={mx - 3} y={120} width={18} height={4} />
          <path d={`M${mx - 1} 95Q${mx + 6} 72 ${mx + 13} 95Z`} />
          <rect x={mx + 5.5} y={64} width={1} height={10} />
        </g>
      ))}
      <rect x={140} y={150} width={120} height={57} />
      <rect x={160} y={128} width={80} height={24} />
      <path d="M158 130C158 78 242 78 242 130Z" />
      <rect x={199.3} y={78} width={1.4} height={14} />
      <circle cx={200} cy={76} r={4} />
      <rect x={70} y={175} width={70} height={32} />
      <rect x={260} y={175} width={70} height={32} />
      <Windows lit={lit} xs={[152, 172, 216, 236]} y={163} w={10} h={22} />
      <Windows lit={lit} xs={[186]} y={158} w={28} h={49} />
      <Windows lit={lit} xs={[84, 108, 276, 300]} y={184} w={8} h={14} />
    </g>
  );
}

export function TvIllustration({ period, sun = 0.5, hijriDay = 14, silhouette = "KUBAH" }: { period: Period; sun?: number; hijriDay?: number; silhouette?: string }) {
  const [top, mid, bottom, sil] = SKIES[period];
  const lit = period === "SENJA" || period === "MALAM";
  const sx = 40 + sun * 320;
  const sy = 160 - Math.sin(Math.PI * sun) * 120;
  const id = `sky-${period}`;
  return (
    <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" className="tv-illustration" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset=".55" stopColor={mid} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect width={400} height={225} fill={`url(#${id})`} />
      {(period === "FAJAR" || period === "MALAM") &&
        STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.s * 0.7} fill="#fff" opacity={(period === "FAJAR" ? 0.35 : 0.8) * (s.s / 1.5)} />)}
      {(period === "SIANG" || period === "SENJA") && (
        <>
          <circle cx={sx} cy={sy} r={28} fill={period === "SENJA" ? "#FFC27A" : "#FFF6D8"} opacity={0.3} />
          <circle cx={sx} cy={sy} r={15} fill={period === "SENJA" ? "#FFC27A" : "#FFF6D8"} />
        </>
      )}
      {period === "MALAM" && <Moon day={hijriDay} />}
      {period === "FAJAR" && <circle cx={330} cy={230} r={60} fill="#FFE2B0" opacity={0.25} />}
      <g stroke="#fff" strokeOpacity={0.07} strokeWidth={0.8} fill="none">
        {[18, 58, 98, 138].flatMap((y, row) =>
          Array.from({ length: 9 }, (_, i) => {
            const x = (row % 2 === 0 ? 20 : 45) + i * 50;
            return (
              <g key={`${x}-${y}`}>
                <rect x={x - 9} y={y - 9} width={18} height={18} />
                <rect x={x - 9} y={y - 9} width={18} height={18} transform={`rotate(45 ${x} ${y})`} />
              </g>
            );
          }),
        )}
      </g>
      <Silhouette kind={silhouette} c={sil} lit={lit} />
    </svg>
  );
}
