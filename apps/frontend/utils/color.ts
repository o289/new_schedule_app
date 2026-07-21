// --- 色計算関数（UI 側で利用可能にするため残す） ---
export function darkenColor(hex: string, amount = 20): string {
  let col = hex.startsWith("#") ? hex.slice(1) : hex;
  if (col.length === 3)
    col = col
      .split("")
      .map((c: string) => c + c)
      .join("");

  const num = parseInt(col, 16);
  let r = (num >> 16) - amount;
  let g = ((num >> 8) & 0x00ff) - amount;
  let b = (num & 0x0000ff) - amount;

  r = r < 0 ? 0 : r;
  g = g < 0 ? 0 : g;
  b = b < 0 ? 0 : b;

  return `rgb(${r}, ${g}, ${b})`;
}
