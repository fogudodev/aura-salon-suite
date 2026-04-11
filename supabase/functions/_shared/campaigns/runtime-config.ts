import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export type SupabaseRuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
};

export type ProfessionalFeatureGateState = {
  featureKey: string;
  professionalId: string;
  enabled: boolean;
  reason: "enabled" | "global_disabled" | "professional_disabled";
  globalEnabled: boolean;
  overrideEnabled: boolean | null;
};

export class FeatureDisabledError extends Error {
  featureKey: string;
  reason: string;
  status: number;

  constructor(featureKey: string, reason: string) {
    super(`FEATURE_DISABLED:${featureKey}:${reason}`);
    this.name = "FeatureDisabledError";
    this.featureKey = featureKey;
    this.reason = reason;
    this.status = 403;
  }
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  return {
    supabaseUrl: (Deno.env.get("SUPABASE_URL") || "").trim(),
    serviceRoleKey: (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim(),
    anonKey: (Deno.env.get("SUPABASE_ANON_KEY") || "").trim(),
  };
}

export function createSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseRuntimeConfig();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export function createSupabaseAnonClient(authHeader: string) {
  const { supabaseUrl, anonKey } = getSupabaseRuntimeConfig();
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

export function extractBearerToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return "";
  return authHeader.replace("Bearer ", "").trim();
}

export function isInternalWorkerAuthorized(params: {
  request: Request;
  workerSecretHeader: string;
  workerSecretEnv: string;
}) {
  const token = extractBearerToken(params.request.headers.get("Authorization"));
  const workerSecret = (params.request.headers.get(params.workerSecretHeader) || "").trim();
  const { serviceRoleKey } = getSupabaseRuntimeConfig();
  const configuredWorkerSecret = (Deno.env.get(params.workerSecretEnv) || "").trim();

  if (serviceRoleKey && token === serviceRoleKey) return true;
  if (configuredWorkerSecret && workerSecret === configuredWorkerSecret) return true;
  return false;
}

export function getInternalFunctionUrl(functionName: string) {
  const { supabaseUrl } = getSupabaseRuntimeConfig();
  if (!supabaseUrl) return "";
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`;
}

export function getAppBaseUrl() {
  return (Deno.env.get("APP_BASE_URL") || "https://gende.io").replace(/\/$/, "");
}

export async function getProfessionalFeatureGateState(params: {
  supabase: SupabaseClient;
  professionalId: string;
  featureKey: string;
  requireGlobalEnabled?: boolean;
  defaultEnabledWhenFlagMissing?: boolean;
}): Promise<ProfessionalFeatureGateState> {
  const requireGlobalEnabled = params.requireGlobalEnabled ?? false;
  const defaultEnabledWhenFlagMissing = params.defaultEnabledWhenFlagMissing ?? true;

  const { data: globalFlag, error: globalError } = await params.supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", params.featureKey)
    .maybeSingle();
  if (globalError) throw globalError;

  const hasGlobalFlag = typeof globalFlag?.enabled === "boolean";
  const globalEnabled = requireGlobalEnabled
    ? Boolean(globalFlag?.enabled)
    : (hasGlobalFlag ? Boolean(globalFlag?.enabled) : defaultEnabledWhenFlagMissing);

  if (!globalEnabled) {
    return {
      featureKey: params.featureKey,
      professionalId: params.professionalId,
      enabled: false,
      reason: "global_disabled",
      globalEnabled: false,
      overrideEnabled: null,
    };
  }

  const { data: override, error: overrideError } = await params.supabase
    .from("professional_feature_overrides")
    .select("enabled")
    .eq("professional_id", params.professionalId)
    .eq("feature_key", params.featureKey)
    .maybeSingle();
  if (overrideError) throw overrideError;

  const overrideEnabled = typeof override?.enabled === "boolean" ? Boolean(override.enabled) : null;
  const enabled = overrideEnabled ?? true;

  if (!enabled) {
    return {
      featureKey: params.featureKey,
      professionalId: params.professionalId,
      enabled: false,
      reason: "professional_disabled",
      globalEnabled: true,
      overrideEnabled,
    };
  }

  return {
    featureKey: params.featureKey,
    professionalId: params.professionalId,
    enabled: true,
    reason: "enabled",
    globalEnabled: true,
    overrideEnabled,
  };
}

export async function isFeatureEnabledForProfessional(params: {
  supabase: SupabaseClient;
  professionalId: string;
  featureKey: string;
  requireGlobalEnabled?: boolean;
  defaultEnabledWhenFlagMissing?: boolean;
}) {
  const gate = await getProfessionalFeatureGateState(params);
  return gate.enabled;
}

export async function assertFeatureEnabledForProfessional(params: {
  supabase: SupabaseClient;
  professionalId: string;
  featureKey: string;
  requireGlobalEnabled?: boolean;
  defaultEnabledWhenFlagMissing?: boolean;
}) {
  const gate = await getProfessionalFeatureGateState(params);
  if (!gate.enabled) {
    throw new FeatureDisabledError(params.featureKey, gate.reason);
  }
  return gate;
}

export async function resolveProfessionalFromRequest(req: Request): Promise<{
  adminClient: SupabaseClient;
  userId: string;
  professionalId: string;
  professional: Record<string, unknown>;
}> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const anonClient = createSupabaseAnonClient(authHeader);
  const adminClient = createSupabaseAdminClient();
  const token = extractBearerToken(authHeader);

  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) throw new Error("Unauthorized");

  const userId = String(claimsData.claims.sub);
  const { data: professional, error: professionalError } = await adminClient
    .from("professionals")
    .select("id, name, business_name, phone")
    .eq("user_id", userId)
    .maybeSingle();

  if (professionalError) throw professionalError;
  if (!professional) throw new Error("Professional not found");

  return {
    adminClient,
    userId,
    professionalId: String(professional.id),
    professional: professional as Record<string, unknown>,
  };
}

export async function invokeInternalWorker(params: {
  functionName: string;
  payload: Record<string, unknown>;
  secretHeader?: string;
  secretEnv?: string;
}) {
  const { serviceRoleKey } = getSupabaseRuntimeConfig();
  const url = getInternalFunctionUrl(params.functionName);
  if (!url || !serviceRoleKey) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (params.secretHeader && params.secretEnv) {
    const secret = (Deno.env.get(params.secretEnv) || "").trim();
    if (secret) headers[params.secretHeader] = secret;
  }

  await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(params.payload),
  });
}
