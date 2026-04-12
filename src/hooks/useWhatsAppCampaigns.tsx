import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useProfessional } from "./useProfessional";
import type {
  CampaignAutomation,
  CampaignDetailData,
  CampaignDashboardData,
  CampaignTemplate,
  CampaignWizardForm,
  LisOpportunity,
} from "@/types/whatsapp-campaigns";

const bootstrapKey = (professionalId?: string) => ["whatsapp-campaigns", "bootstrap", professionalId];

type CampaignInvokeError = Error & {
  statusCode?: number;
  details?: unknown;
};

function toCampaignInvokeError(input: unknown, fallbackMessage: string): CampaignInvokeError {
  let message = fallbackMessage;
  let statusCode: number | undefined;
  let details: unknown;

  if (input instanceof Error && input.message) {
    message = input.message;
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) {
      message = obj.message;
    }
    if (typeof obj.status === "number") {
      statusCode = obj.status;
    }
    if (obj.context && typeof obj.context === "object") {
      const context = obj.context as Record<string, unknown>;
      if (typeof context.status === "number") {
        statusCode = context.status;
      }
    }
    details = obj;
  }

  if (!message || message === "[object Object]") {
    message = fallbackMessage;
  }

  const error = new Error(message) as CampaignInvokeError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function throwIfFunctionDataError(data: unknown, fallbackMessage: string) {
  if (!data || typeof data !== "object") return;
  const record = data as Record<string, unknown>;
  const rawError = record.error;
  if (!rawError) return;

  let message = fallbackMessage;
  if (typeof rawError === "string" && rawError.trim()) {
    message = rawError;
  } else if (rawError && typeof rawError === "object") {
    const nested = rawError as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      message = nested.message;
    }
  }

  const error = new Error(message) as CampaignInvokeError;
  const details = record.details;
  if (details && typeof details === "object") {
    const status = (details as Record<string, unknown>).status;
    if (typeof status === "number") error.statusCode = status;
    error.details = details;
  }
  throw error;
}

function shouldRetryCampaignQuery(failureCount: number, error: unknown) {
  const statusCode = typeof (error as CampaignInvokeError)?.statusCode === "number"
    ? (error as CampaignInvokeError).statusCode
    : undefined;
  if (statusCode === 500) return false;
  if (statusCode && statusCode >= 400) return false;
  return failureCount < 1;
}

export const useWhatsAppCampaignsDashboard = () => {
  const { data: professional } = useProfessional();

  return useQuery({
    queryKey: bootstrapKey(professional?.id),
    queryFn: async () => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "get-bootstrap" },
      });
      if (error) throw toCampaignInvokeError(error, "Falha ao carregar bootstrap de campanhas");
      throwIfFunctionDataError(data, "Falha ao carregar bootstrap de campanhas");
      return data as CampaignDashboardData;
    },
    enabled: !!professional?.id,
    retry: shouldRetryCampaignQuery,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useWhatsAppCampaignBuilderPreview = (params: {
  objective: CampaignWizardForm["objective"];
  audienceFilters: Record<string, unknown>;
  messageBody: string;
  ctaType: CampaignWizardForm["ctaType"];
  ctaPayload: Record<string, unknown>;
  enabled: boolean;
}) => {
  const { data: professional } = useProfessional();

  return useQuery({
    queryKey: [
      "whatsapp-campaigns",
      "preview",
      professional?.id,
      params.objective,
      JSON.stringify(params.audienceFilters || {}),
      params.messageBody,
      params.ctaType,
      JSON.stringify(params.ctaPayload || {}),
    ],
    queryFn: async () => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: {
          action: "preview-builder",
          objective: params.objective,
          audienceFilters: params.audienceFilters,
          messageBody: params.messageBody,
          ctaType: params.ctaType,
          ctaPayload: params.ctaPayload,
        },
      });
      if (error) throw toCampaignInvokeError(error, "Falha ao gerar preview da campanha");
      throwIfFunctionDataError(data, "Falha ao gerar preview da campanha");
      return data;
    },
    enabled: !!professional?.id && params.enabled,
    retry: shouldRetryCampaignQuery,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useSaveWhatsAppCampaignDraft = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (form: CampaignWizardForm) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: {
          action: "save-draft",
          ...form,
          audienceEstimateJson: form.audienceEstimateJson || {},
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const useCloneWhatsAppCampaign = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "clone-campaign", campaignId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const useWhatsAppCampaignDetails = (campaignId?: string | null) => {
  const { data: professional } = useProfessional();

  return useQuery({
    queryKey: ["whatsapp-campaigns", "details", professional?.id, campaignId],
    queryFn: async () => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "get-campaign", campaignId },
      });
      if (error) throw toCampaignInvokeError(error, "Falha ao carregar detalhes da campanha");
      throwIfFunctionDataError(data, "Falha ao carregar detalhes da campanha");
      return data as CampaignDetailData;
    },
    enabled: !!professional?.id && !!campaignId,
    retry: shouldRetryCampaignQuery,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useStartWhatsAppCampaign = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { campaignId: string; batchSize?: number; maxBatches?: number }) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "start-campaign", ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const usePauseWhatsAppCampaign = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { campaignId: string; reason?: string | null }) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "pause-campaign", ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const useCancelWhatsAppCampaign = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { campaignId: string; reason?: string | null }) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "cancel-campaign", ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const useCampaignTemplates = () => {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["whatsapp-campaigns", "templates", professional?.id],
    queryFn: async () => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "list-templates" },
      });
      if (error) throw toCampaignInvokeError(error, "Falha ao listar templates");
      throwIfFunctionDataError(data, "Falha ao listar templates");
      return (data?.templates || []) as CampaignTemplate[];
    },
    enabled: !!professional?.id,
    retry: shouldRetryCampaignQuery,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useSaveCampaignTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      name: string;
      category: string;
      objective: string;
      body: string;
      variablesJson: unknown;
      tone: string;
      isAiGenerated?: boolean;
      previewExampleJson?: unknown;
    }) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "save-template", ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns", "templates"] });
    },
  });
};

export const useArchiveCampaignTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "archive-template", templateId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns", "templates"] });
    },
  });
};

export const useGenerateLisOpportunities = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "generate-opportunities" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const useLisOpportunityAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { opportunityId: string; kind: "viewed" | "dismissed" | "remind_later" | "opened_details" | "generate_campaign" }) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "opportunity-action", ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const useCampaignLimits = () => {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["whatsapp-campaigns", "limits", professional?.id],
    queryFn: async () => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "get-limits" },
      });
      if (error) throw toCampaignInvokeError(error, "Falha ao carregar limites de campanhas");
      throwIfFunctionDataError(data, "Falha ao carregar limites de campanhas");
      return data as CampaignDashboardData["limits"];
    },
    enabled: !!professional?.id,
    retry: shouldRetryCampaignQuery,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useLisOpportunities = () => {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["whatsapp-campaigns", "opportunities", professional?.id],
    queryFn: async () => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "list-opportunities" },
      });
      if (error) throw toCampaignInvokeError(error, "Falha ao listar oportunidades da Lis");
      throwIfFunctionDataError(data, "Falha ao listar oportunidades da Lis");
      return (data?.opportunities || []) as LisOpportunity[];
    },
    enabled: !!professional?.id,
    retry: shouldRetryCampaignQuery,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useSaveCampaignAutomation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      name: string;
      triggerType: string;
      rulesJson?: Record<string, unknown>;
      objective?: string;
      audienceType?: string;
      audienceFilterJson?: Record<string, unknown>;
      templateId?: string | null;
      messageBody?: string;
      cooldownDays?: number;
      isActive?: boolean;
      autoStart?: boolean;
      sendConfigJson?: Record<string, unknown>;
    }) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "save-automation", ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.automation as CampaignAutomation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const useToggleCampaignAutomation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { automationId: string; isActive: boolean }) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "toggle-automation", ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.automation as CampaignAutomation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const useRunCampaignAutomation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { automationId: string; force?: boolean }) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "run-automation", ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.result as Record<string, unknown>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};

export const useRunActiveCampaignAutomations = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload?: { limit?: number }) => {
      const { data, error } = await api.functions.invoke("whatsapp-campaigns", {
        body: { action: "run-automations", ...(payload || {}) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.result as Record<string, unknown>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    },
  });
};
