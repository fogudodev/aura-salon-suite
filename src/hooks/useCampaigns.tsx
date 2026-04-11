import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useProfessional } from "./useProfessional";

type FunctionErrorContext = {
  status?: number;
  payload?: Record<string, unknown> | null;
  message: string;
};

type SendCampaignAction = "get-limits" | "create-campaign";

async function parseInvokeError(error: unknown): Promise<FunctionErrorContext> {
  const fallbackMessage = error instanceof Error ? error.message : "Request failed";
  const context = (error as { context?: unknown } | null)?.context;
  const response = context instanceof Response ? context : null;

  if (!response) {
    return { message: fallbackMessage };
  }

  let payload: Record<string, unknown> | null = null;
  try {
    const parsed = await response.clone().json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = null;
  }

  const payloadError = typeof payload?.error === "string" ? payload.error : "";
  return {
    status: response.status,
    payload,
    message: payloadError || fallbackMessage,
  };
}

async function getAccessTokenOrThrow() {
  const { data, error } = await api.auth.getSession();
  if (error) {
    throw new Error("Não foi possível validar sua sessão");
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Sua sessão expirou. Faça login novamente");
  }

  return token;
}

async function invokeSendCampaign<T>(
  action: SendCampaignAction,
  professionalId: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!professionalId) {
    throw new Error("professionalId é obrigatório");
  }

  const token = await getAccessTokenOrThrow();
  const { data, error } = await api.functions.invoke("send-campaign", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: {
      action,
      professionalId,
      ...payload,
    },
  });

  if (error) {
    const parsed = await parseInvokeError(error);
    if (parsed.status === 401) {
      throw new Error("Sessão inválida. Entre novamente para continuar");
    }
    if (parsed.status === 403) {
      throw new Error(
        parsed.message || "Você não tem permissão ou seu plano não permite campanhas",
      );
    }
    throw new Error(parsed.message || "Erro ao processar campanha");
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  return data as T;
}

export const useCampaigns = () => {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["campaigns", professional?.id],
    queryFn: async () => {
      const { data, error } = await api
        .from("campaigns")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });
};

export const useCampaignLimits = () => {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["campaign-limits", professional?.id],
    queryFn: async () => {
      return invokeSendCampaign<Record<string, unknown>>("get-limits", professional!.id);
    },
    enabled: !!professional?.id,
  });
};

export const useSendCampaign = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { professionalId: string; name: string; message: string; clientIds?: string[] }) => {
      if (!params.professionalId) throw new Error("professionalId é obrigatório");
      if (!params.name?.trim()) throw new Error("Nome da campanha é obrigatório");
      if (!params.message?.trim()) throw new Error("Mensagem da campanha é obrigatória");
      if (params.clientIds && !Array.isArray(params.clientIds)) {
        throw new Error("clientIds deve ser um array");
      }

      return invokeSendCampaign<Record<string, unknown>>("create-campaign", params.professionalId, {
        name: params.name,
        message: params.message,
        clientIds: params.clientIds || [],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign-limits"] });
    },
  });
};

export const useAddonPurchases = () => {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["addon-purchases", professional?.id],
    queryFn: async () => {
      const { data, error } = await api
        .from("addon_purchases")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });
};

export const useCampaignContacts = (campaignId: string | null) => {
  return useQuery({
    queryKey: ["campaign-contacts", campaignId],
    queryFn: async () => {
      const { data, error } = await api
        .from("campaign_contacts")
        .select("*")
        .eq("campaign_id", campaignId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!campaignId,
  });
};

export const usePlanLimits = () => {
  return useQuery({
    queryKey: ["plan-limits-all"],
    queryFn: async () => {
      const { data, error } = await api
        .from("plan_limits")
        .select("*")
        .order("plan_id");
      if (error) throw error;
      return data;
    },
  });
};

export const useUpdatePlanLimits = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; daily_reminders: number; daily_campaigns: number; campaign_max_contacts: number; campaign_min_interval_hours: number }) => {
      const { id, ...updates } = params;
      const { error } = await api
        .from("plan_limits")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-limits-all"] });
    },
  });
};
