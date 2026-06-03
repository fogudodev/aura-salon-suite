export const APP_ROUTE_FLAG_KEYS: Record<string, string> = {
  "/": "dashboard",
  "/bookings": "bookings",
  "/services": "services",
  "/clients": "clients",
  "/waitlist": "waitlist",
  "/team": "team",
  "/commission-report": "commission_report",
  "/team-performance": "team_performance",
  "/automations": "automations",
  "/campaigns": "campaigns",
  "/payment-chat": "payment_chat",
  "/support-chat": "support_chat",
  "/ai-assistant": "ai_assistant",
  "/finance": "finance",
  "/cash-register": "cash_register",
  "/public-page": "public_page",
  "/products": "products",
  "/service-packages": "service_packages",
  "/coupons": "coupons",
  "/reports": "reports",
  "/reviews": "reviews",
  "/settings": "settings",
  "/upsell": "upsell_inteligente",
  "/upsell/config": "upsell_inteligente",
  "/instagram-automation": "instagram_dm",
  "/rewards": "gende_rewards",
  "/reactivation": "reactivation_engine",
  "/courses": "courses",
  "/courses/list": "courses",
  "/courses/classes": "courses",
  "/courses/students": "courses",
  "/courses/waitlist": "courses",
  "/courses/certificates": "courses",
  "/courses/finance": "courses",
};

export const RECEPTION_ALLOWED_ROUTES = [
  "/",
  "/bookings",
  "/clients",
  "/cash-register",
  "/automations",
];

export const SETTINGS_SECTION_FLAG_KEYS: Partial<Record<string, string>> = {
  payment: "public_page",
  whatsapp: "automations",
};

export const INSTRUCTION_SECTION_FLAG_KEYS: Record<string, string> = {
  bookings: "bookings",
  waitlist: "waitlist",
  services: "services",
  clients: "clients",
  automations: "automations",
  campaigns: "campaigns",
  communication: "payment_chat",
  "support-chat": "support_chat",
  "ai-assistant": "ai_assistant",
  upsell: "upsell_inteligente",
  finance: "finance",
  "cash-register": "cash_register",
  "public-page": "public_page",
  products: "products",
  "service-packages": "service_packages",
  coupons: "coupons",
  reports: "reports",
  reviews: "reviews",
  team: "team",
  "commission-report": "commission_report",
  "team-performance": "team_performance",
  "instagram-dm": "instagram_dm",
  "gende-rewards": "gende_rewards",
  courses: "courses",
  reactivation: "reactivation_engine",
};

export const SYSTEM_GUIDE_CATEGORY_FLAG_KEYS: Record<string, string> = {
  agenda: "bookings",
  clientes: "clients",
  servicos: "services",
  equipe: "team",
  financeiro: "finance",
  estoque: "products",
  whatsapp: "automations",
  automacao: "automations",
  relatorios: "reports",
  "pagina-online": "public_page",
  ia: "ai_assistant",
  campanhas: "campaigns",
  avaliacoes: "reviews",
  cupons: "coupons",
  "instagram-dm": "instagram_dm",
  "gende-rewards": "gende_rewards",
  cursos: "courses",
  "upsell-inteligente": "upsell_inteligente",
};

export const MARKETING_FEATURE_FLAG_KEYS: Record<string, string> = {
  agenda: "bookings",
  lembretes: "automations",
  pagamentos: "public_page",
  relatorios: "reports",
  clientes: "clients",
  financeiro: "finance",
  equipe: "team",
  produtos: "products",
  cupons: "coupons",
  campanhas: "campaigns",
  "google-calendar": "google_calendar",
  upsell: "upsell_inteligente",
  reativacao: "reactivation_engine",
  avaliacoes: "reviews",
  instagram: "instagram_dm",
  pacotes: "service_packages",
  fidelidade: "gende_rewards",
  "pagina-publica": "public_page",
  "lista-espera": "waitlist",
  "assistente-ia": "ai_assistant",
};

export const PLAN_FEATURE_FLAG_KEYS: Record<string, string> = {
  "WhatsApp automático": "automations",
  "Página pública": "public_page",
  "Programa de fidelidade": "gende_rewards",
  "Campanhas ilimitadas": "campaigns",
  "Assistente IA": "ai_assistant",
};

export const LANDING_SECTION_FLAG_KEYS: Record<string, string> = {
  interactive_public_page_tabs: "public_page",
};

export function getAutomationTriggerFlagKey(triggerType?: string | null) {
  if (!triggerType) return null;
  if (triggerType.startsWith("course_")) return "courses";
  if (triggerType === "reactivation_30d") return "reactivation_engine";
  if (triggerType === "post_sale_review") return "reviews";
  return null;
}

export function getChatTypeFlagKey(chatType?: string | null) {
  if (chatType === "payment") return "payment_chat";
  if (chatType === "support") return "support_chat";
  return null;
}
