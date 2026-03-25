// Stripe plan configuration - centralized
export const STRIPE_PLANS = {
  essencial: {
    name: "Essencial",
    price: "R$ 49,90",
    priceMonthly: "R$ 49,90",
    priceAnnual: "R$ 499,90",
    priceId: "price_1T57OUFjVGP9lWs08ZViwOdY",
    priceIdAnnual: "price_1T5DskFjVGP9lWs0IjaVXqPL",
    productId: "prod_U3DqJqyo9urw60",
    productIdAnnual: "prod_U3KXrtuJF9WAOC",
    features: [
      "100 agendamentos/mês",
      "10 serviços",
      "100 clientes",
      "5 lembretes/dia",
      "15 produtos em estoque",
      "Página pública padrão",
      "Relatórios básicos",
    ],
    limits: {
      maxBookingsPerMonth: 100,
      maxServices: 10,
      maxClients: 100,
      maxProducts: 15,
      dailyReminders: 5,
      dailyCampaigns: 0,
    },
  },
  enterprise: {
    name: "Enterprise",
    price: "R$ 99,90",
    priceMonthly: "R$ 99,90",
    priceAnnual: "R$ 999,00",
    priceId: "price_1T57PnFjVGP9lWs0YWLEVvBZ",
    priceIdAnnual: "price_1T5Du2FjVGP9lWs0iO6PN4eF",
    productId: "prod_U3DrWGOLjl8pSx",
    productIdAnnual: "prod_U3KZFQMZF4cxPs",
    features: [
      "Agendamentos ilimitados",
      "Serviços ilimitados",
      "Clientes ilimitados",
      "Produtos ilimitados",
      "20 lembretes/dia (extra R$ 0,70/lembrete)",
      "3 campanhas/dia (extra R$ 3,00/campanha)",
      "Contatos extra em campanhas R$ 0,70/contato",
      "Relatórios avançados",
      "Página pública personalizada",
      "Cobrar sinal de agendamento",
      "Cupons e promoções",
      "Avaliações",
      "Assistente IA",
      "Até 5 profissionais inclusos",
      "Adicional R$ 7/profissional (máx 20)",
      "Integração Google Calendar (Salão)",
      "Suporte prioritário",
    ],
    limits: {
      maxBookingsPerMonth: -1,
      maxServices: -1,
      maxClients: -1,
      maxProducts: -1,
      dailyReminders: 20,
      dailyCampaigns: 3,
      campaignMinIntervalHours: 5,
      maxEmployees: 5,
      maxEmployeesHardLimit: 20,
      additionalEmployeePrice: 7,
      additionalEmployeePriceId: "price_1T5EBbFjVGP9lWs0mTpdPlol",
      additionalEmployeeProductId: "prod_U3KrydRhlXjRr4",
    },
  },
} as const;

export type PlanId = keyof typeof STRIPE_PLANS;

// All product IDs that map to each plan (monthly + annual)
export const PRODUCT_TO_PLAN: Record<string, PlanId> = {
  "prod_U3DqJqyo9urw60": "essencial",
  "prod_U3KXrtuJF9WAOC": "essencial",
  "prod_U3DrWGOLjl8pSx": "enterprise",
  "prod_U3KZFQMZF4cxPs": "enterprise",
};

// Add-on products for Enterprise overages
export const ADDON_PRODUCTS = {
  extraReminder: {
    name: "Lembrete Extra",
    price: 0.70, // R$0,70 per extra reminder
    priceId: "price_1T5d1lFjVGP9lWs0d7ARdW6B",
    productId: "prod_U3kWglGRN2xSfd",
  },
  extraCampaign: {
    name: "Campanha Extra",
    price: 3.00, // R$3,00 per extra campaign (R$15/5)
    priceId: "price_1T7HWPFjVGP9lWs0NdSjwuwO",
    productId: "prod_U5SRYA26gJU9in",
  },
  extraCampaignContact: {
    name: "Contato Extra em Campanha",
    price: 0.70, // R$0,70 per extra contact (R$14/20)
    priceId: "price_1T7HXcFjVGP9lWs0pUGKjxSb",
    productId: "prod_U5SS8wni1RuSLr",
  },
} as const;

// Feature access rules per plan
export type FeatureKey =
  | "dashboard"
  | "bookings"
  | "services"
  | "clients"
  | "automations"
  | "campaigns"
  | "finance"
  | "public-page"
  | "products"
  | "coupons"
  | "reports"
  | "reviews"
  | "settings"
  | "team"
  | "payment-settings"
  | "commission-report"
  | "team-performance"
  | "google-calendar"
  | "support-chat"
  | "payment-chat"
  | "ai-assistant"
  | "cash-register"
  | "upsell"
  | "rewards"
  | "courses"
  | "reactivation";

export const PLAN_FEATURES: Record<PlanId | "none", FeatureKey[]> = {
  none: [
    "dashboard",
    "bookings",
    "services",
    "clients",
    "settings",
  ],
  essencial: [
    "dashboard",
    "bookings",
    "services",
    "clients",
    "automations", // only reminders, no campaigns
    "support-chat",
    "payment-chat",
    "finance",
    "public-page",
    "products",
    "reports",
    "settings",
    "cash-register",
  ],
  enterprise: [
    "dashboard",
    "bookings",
    "services",
    "clients",
    "automations",
    "campaigns",
    "finance",
    "public-page",
    "products",
    "coupons",
    "reports",
    "reviews",
    "settings",
    "team",
    "payment-settings",
    "commission-report",
    "team-performance",
    "google-calendar",
    "support-chat",
    "payment-chat",
    "ai-assistant",
    "cash-register",
    "upsell",
    "rewards",
    "courses",
  ],
};

// Settings sections accessible per plan
export const SETTINGS_SECTIONS: Record<PlanId | "none", string[]> = {
  none: ["hours", "subscription", "security"],
  essencial: ["hours", "subscription", "whatsapp", "security"],
  enterprise: ["system", "hours", "payment", "subscription", "whatsapp", "google-calendar", "security"],
};
