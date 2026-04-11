import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export type SupabaseRuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
};

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
