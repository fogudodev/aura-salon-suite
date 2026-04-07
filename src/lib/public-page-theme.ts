type PublicPageThemeInput = {
  bgColor?: string | null;
  componentColor?: string | null;
  textColor?: string | null;
};

export type PublicPageTheme = {
  bg: string;
  pageBackground: string;
  shell: string;
  surface: string;
  surfaceAlt: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentFaint: string;
  accentGradient: string;
  accentGradientVertical: string;
  accentRing: string;
  accentShadow: string;
  text: string;
  textMuted: string;
  textSoft: string;
  inverseText: string;
  heroOverlay: string;
  mediaOverlay: string;
  darkPanel: string;
  darkPanelText: string;
  darkPanelMuted: string;
  successSoft: string;
  successText: string;
};

const DEFAULT_BG = "#fff1f7";
const DEFAULT_COMPONENT = "#c026d3";
const DEFAULT_TEXT = "#0f172a";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(input: string | null | undefined, fallback: string) {
  const value = (input || "").trim();
  const shortHex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const longHex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

  if (shortHex.test(value)) {
    return value.replace(shortHex, (_match, r, g, b) => `#${r}${r}${g}${g}${b}${b}`).toLowerCase();
  }

  if (longHex.test(value)) {
    return value.startsWith("#") ? value.toLowerCase() : `#${value.toLowerCase()}`;
  }

  return fallback;
}

function hexToRgb(input: string) {
  const hex = normalizeHex(input, "#000000").replace("#", "");

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mix(colorA: string, colorB: string, weight: number) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const ratio = clamp(weight, 0, 1);

  return rgbToHex(
    a.r + (b.r - a.r) * ratio,
    a.g + (b.g - a.g) * ratio,
    a.b + (b.b - a.b) * ratio,
  );
}

function withAlpha(color: string, alpha: number) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function relativeLuminance(color: string) {
  const { r, g, b } = hexToRgb(color);
  const channel = [r, g, b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channel[0]) + (0.7152 * channel[1]) + (0.0722 * channel[2]);
}

function isLight(color: string) {
  return relativeLuminance(color) > 0.55;
}

function getContrastText(color: string) {
  return isLight(color) ? "#0f172a" : "#ffffff";
}

export function buildPublicPageTheme(input: PublicPageThemeInput): PublicPageTheme {
  const bg = normalizeHex(input.bgColor, DEFAULT_BG);
  const accent = normalizeHex(input.componentColor, DEFAULT_COMPONENT);
  const text = normalizeHex(input.textColor, DEFAULT_TEXT);
  const lightBackground = isLight(bg);
  const lightText = isLight(text);
  const accentStrong = mix(accent, "#000000", 0.18);
  const accentSoft = mix(accent, "#ffffff", 0.28);
  const shell = lightBackground ? mix(bg, "#ffffff", 0.8) : mix(bg, "#ffffff", 0.08);
  const surface = lightBackground ? mix(bg, "#ffffff", 0.9) : mix(bg, "#ffffff", 0.12);
  const surfaceAlt = lightBackground ? mix(bg, "#ffffff", 0.78) : mix(bg, "#ffffff", 0.18);
  const surfaceMuted = lightBackground ? mix(bg, accent, 0.08) : mix(bg, "#ffffff", 0.24);
  const darkPanel = lightBackground ? mix(accent, "#0f172a", 0.74) : mix(bg, "#0f172a", 0.52);
  const darkPanelText = getContrastText(darkPanel);

  return {
    bg,
    pageBackground: `radial-gradient(circle at top, ${withAlpha(accent, lightBackground ? 0.16 : 0.24)} 0%, transparent 34%), linear-gradient(180deg, ${mix(bg, "#ffffff", lightBackground ? 0.06 : 0.02)} 0%, ${bg} 48%, ${mix(bg, lightBackground ? "#ffffff" : "#0f172a", lightBackground ? 0.14 : 0.18)} 100%)`,
    shell,
    surface,
    surfaceAlt,
    surfaceMuted,
    border: withAlpha(text, lightBackground ? 0.12 : 0.2),
    borderStrong: withAlpha(text, lightBackground ? 0.2 : 0.28),
    accent,
    accentStrong,
    accentSoft,
    accentFaint: withAlpha(accent, lightBackground ? 0.14 : 0.22),
    accentGradient: `linear-gradient(90deg, ${accentStrong} 0%, ${accentSoft} 100%)`,
    accentGradientVertical: `linear-gradient(180deg, ${accentStrong} 0%, ${accentSoft} 100%)`,
    accentRing: withAlpha(accent, 0.22),
    accentShadow: withAlpha(accent, 0.42),
    text,
    textMuted: withAlpha(text, lightBackground ? 0.72 : 0.82),
    textSoft: withAlpha(text, lightBackground ? 0.52 : 0.64),
    inverseText: getContrastText(accent),
    heroOverlay: lightText
      ? "linear-gradient(180deg, rgba(8,15,31,0.08), rgba(8,15,31,0.62))"
      : "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.72))",
    mediaOverlay: lightText
      ? "linear-gradient(180deg, transparent 0%, rgba(15,23,42,0.88) 90%)"
      : "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.9) 90%)",
    darkPanel,
    darkPanelText,
    darkPanelMuted: withAlpha(darkPanelText, 0.72),
    successSoft: lightBackground ? "#ecfdf3" : mix(bg, "#16a34a", 0.22),
    successText: lightBackground ? "#15803d" : "#dcfce7",
  };
}
