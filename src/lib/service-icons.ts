export type ServiceIconOption = {
  key: string;
  label: string;
  emoji: string;
  keywords: string[];
};

export const SERVICE_ICON_OPTIONS: ServiceIconOption[] = [
  { key: "scissors", label: "Corte", emoji: "✂️", keywords: ["corte", "cabelo", "hair"] },
  { key: "brush", label: "Escova", emoji: "🪮", keywords: ["escova", "brush", "alisamento"] },
  { key: "sparkles", label: "Brilho", emoji: "✨", keywords: ["hidratação", "brilho", "tratamento"] },
  { key: "palette", label: "Coloração", emoji: "🎨", keywords: ["coloração", "coloração", "mechas", "tintura"] },
  { key: "nails", label: "Unhas", emoji: "💅", keywords: ["unha", "manicure", "pedicure", "gel"] },
  { key: "makeup", label: "Maquiagem", emoji: "💄", keywords: ["maquiagem", "make", "beauty"] },
  { key: "lashes", label: "Olhar", emoji: "👁️", keywords: ["cilios", "cílios", "sobrancelha", "lash", "brow"] },
  { key: "spa", label: "Spa", emoji: "🪷", keywords: ["spa", "massagem", "relaxamento"] },
  { key: "massage", label: "Massagem", emoji: "🤲", keywords: ["massagem", "corpo", "terapia"] },
  { key: "facial", label: "Facial", emoji: "🧴", keywords: ["facial", "pele", "limpeza", "skin"] },
  { key: "drop", label: "Hidratação", emoji: "💧", keywords: ["hidratação", "hidratar", "drop"] },
  { key: "sun", label: "Bronze", emoji: "☀️", keywords: ["bronze", "sol", "tan"] },
  { key: "crown", label: "Noiva", emoji: "👑", keywords: ["noiva", "premium", "luxo"] },
  { key: "gem", label: "Premium", emoji: "💎", keywords: ["premium", "luxo", "especial"] },
  { key: "flower", label: "Bem-estar", emoji: "🌸", keywords: ["bem-estar", "relax", "flor"] },
  { key: "heart", label: "Cuidados", emoji: "💗", keywords: ["cuidados", "amor", "delicado"] },
  { key: "feet", label: "Pés", emoji: "🦶", keywords: ["pé", "pes", "pedicure"] },
  { key: "body", label: "Corpo", emoji: "🧘", keywords: ["corpo", "postura", "bem-estar"] },
  { key: "glow", label: "Glow", emoji: "🌟", keywords: ["glow", "shine", "estrela"] },
  { key: "laser", label: "Laser", emoji: "⚡", keywords: ["laser", "depilação", "tecnologia"] },
  { key: "package", label: "Pacote", emoji: "🎁", keywords: ["pacote", "combo", "presente"] },
  { key: "camera", label: "Photo Ready", emoji: "📸", keywords: ["foto", "ensaio", "evento"] },
  { key: "wave", label: "Ondas", emoji: "〰️", keywords: ["ondas", "cacheado", "wave"] },
  { key: "leaf", label: "Natural", emoji: "🍃", keywords: ["natural", "vegano", "leaf"] },
];

const FALLBACK_ICON = SERVICE_ICON_OPTIONS[0];

export function getServiceIconOption(iconKey?: string | null, serviceName?: string | null, category?: string | null) {
  if (iconKey) {
    const direct = SERVICE_ICON_OPTIONS.find((option) => option.key === iconKey);
    if (direct) {
      return direct;
    }
  }

  const haystack = `${serviceName || ""} ${category || ""}`.toLowerCase();
  const matched = SERVICE_ICON_OPTIONS.find((option) =>
    option.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())),
  );

  return matched || FALLBACK_ICON;
}
