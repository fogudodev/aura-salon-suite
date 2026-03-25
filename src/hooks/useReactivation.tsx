import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useProfessional } from "./useProfessional";
import { toast } from "sonner";

export type ReactivationClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  reactivation_score: number;
  reactivation_status: string;
  last_completed_appointment_at: string | null;
  avg_return_interval_days: number | null;
  average_ticket: number;
};

export type ReactivationMetrics = {
  revenue: number;
  converted: number;
  totalSent: number;
  conversionRate: number;
  atRiskCount: number;
};

export const useReactivationMetrics = () => {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["reactivation-metrics", professional?.id],
    queryFn: async () => {
      const { data, error } = await api.functions.invoke("reactivation-engine", {
        body: { action: "get-metrics", professionalId: professional!.id },
      });
      if (error) throw error;
      return data.metrics as ReactivationMetrics;
    },
    enabled: !!professional?.id,
  });
};

export const useEligibleClients = () => {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["reactivation-eligible", professional?.id],
    queryFn: async () => {
      const { data, error } = await api.functions.invoke("reactivation-engine", {
        body: { action: "get-eligible", professionalId: professional!.id },
      });
      if (error) throw error;
      return (data.clients || []) as ReactivationClient[];
    },
    enabled: !!professional?.id,
  });
};

export const useComputeScores = () => {
  const { data: professional } = useProfessional();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.functions.invoke("reactivation-engine", {
        body: { action: "compute-scores", professionalId: professional!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["reactivation-eligible"] });
      qc.invalidateQueries({ queryKey: ["reactivation-metrics"] });
      toast.success(`Scores atualizados para ${data.updated} clientes`);
    },
    onError: () => toast.error("Erro ao calcular scores"),
  });
};

export const useReactivationCampaigns = () => {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["reactivation-campaigns", professional?.id],
    queryFn: async () => {
      const { data, error } = await api
        .from("reactivation_campaigns" as any)
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!professional?.id,
  });
};

export const useCreateReactivationCampaign = () => {
  const qc = useQueryClient();
  const { data: professional } = useProfessional();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      message_template: string;
      segment_filter: any;
      clientIds: string[];
    }) => {
      // Create campaign
      const { data: campaign, error } = await api
        .from("reactivation_campaigns" as any)
        .insert({
          professional_id: professional!.id,
          name: params.name,
          message_template: params.message_template,
          segment_filter: params.segment_filter,
          total_recipients: params.clientIds.length,
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Get client details for recipients
      const { data: clients } = await api
        .from("clients")
        .select("id, name, phone")
        .in("id", params.clientIds);

      // Create recipients
      if (clients && clients.length > 0) {
        const recipients = clients.map((c: any) => ({
          campaign_id: (campaign as any).id,
          client_id: c.id,
          client_name: c.name,
          client_phone: c.phone,
          message_payload: params.message_template
            .replace("{nome}", c.name || "")
            .replace("{nome_cliente}", c.name || ""),
          status: "pending",
        }));
        await api
          .from("reactivation_campaign_recipients" as any)
          .insert(recipients as any);
      }

      return campaign;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reactivation-campaigns"] });
      toast.success("Campanha de reativação criada!");
    },
    onError: () => toast.error("Erro ao criar campanha"),
  });
};

export const useExecuteReactivationCampaign = () => {
  const { data: professional } = useProfessional();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await api.functions.invoke("reactivation-engine", {
        body: {
          action: "execute-campaign",
          professionalId: professional!.id,
          campaignId,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["reactivation-campaigns"] });
      qc.invalidateQueries({ queryKey: ["reactivation-metrics"] });
      toast.success(`Campanha executada! ${data.sent}/${data.total} enviados`);
    },
    onError: (err: any) => toast.error(err.message || "Erro ao executar campanha"),
  });
};
