import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

export type UpsellRule = {
  id: string;
  professional_id: string;
  source_service_id: string;
  recommended_service_id: string;
  priority: number;
  promo_message: string | null;
  promo_price: number | null;
  discount_percentage: number;
  message_template: string | null;
  send_timing: string;
  is_active: boolean;
  suggestion_count: number;
  conversion_count: number;
  created_at: string;
  updated_at: string;
};

export type UpsellEvent = {
  id: string;
  professional_id: string;
  booking_id: string | null;
  source_service_id: string | null;
  recommended_service_id: string | null;
  client_phone: string | null;
  client_id: string | null;
  channel: string;
  status: string;
  event_type: string;
  value: number;
  upsell_revenue: number;
  created_at: string;
};

export type UpsellRecipient = {
  id: string;
  professional_id: string;
  client_id: string | null;
  booking_id: string | null;
  upsell_rule_id: string | null;
  client_phone: string | null;
  message_payload: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  converted_at: string | null;
  created_at: string;
};

export const useUpsellRules = (professionalId?: string) => {
  return useQuery({
    queryKey: ["upsell-rules", professionalId],
    queryFn: async () => {
      let query = api
        .from("upsell_rules" as any)
        .select("*")
        .order("priority", { ascending: true });
      if (professionalId) {
        query = query.eq("professional_id", professionalId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as UpsellRule[];
    },
    enabled: !!professionalId,
  });
};

export const useUpsellRulesForService = (professionalId: string, sourceServiceId: string) => {
  return useQuery({
    queryKey: ["upsell-rules", professionalId, sourceServiceId],
    queryFn: async () => {
      const { data, error } = await api
        .from("upsell_rules" as any)
        .select("*")
        .eq("professional_id", professionalId)
        .eq("source_service_id", sourceServiceId)
        .eq("is_active", true)
        .order("priority", { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data || []) as unknown as UpsellRule[];
    },
    enabled: !!professionalId && !!sourceServiceId,
  });
};

export const useUpsertUpsellRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<UpsellRule> & { professional_id: string; source_service_id: string; recommended_service_id: string }) => {
      const { error } = await api
        .from("upsell_rules" as any)
        .upsert(rule as any, { onConflict: "professional_id,source_service_id,recommended_service_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["upsell-rules"] });
      toast.success("Regra de upsell salva");
    },
    onError: () => toast.error("Erro ao salvar regra de upsell"),
  });
};

export const useDeleteUpsellRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api
        .from("upsell_rules" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["upsell-rules"] });
      toast.success("Regra removida");
    },
    onError: () => toast.error("Erro ao remover regra"),
  });
};

export const useUpsellEvents = (professionalId?: string) => {
  return useQuery({
    queryKey: ["upsell-events", professionalId],
    queryFn: async () => {
      const { data, error } = await api
        .from("upsell_events" as any)
        .select("*")
        .eq("professional_id", professionalId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as UpsellEvent[];
    },
    enabled: !!professionalId,
  });
};

export const useUpsellRecipients = (professionalId?: string) => {
  return useQuery({
    queryKey: ["upsell-recipients", professionalId],
    queryFn: async () => {
      const { data, error } = await api
        .from("upsell_recipients" as any)
        .select("*")
        .eq("professional_id", professionalId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as UpsellRecipient[];
    },
    enabled: !!professionalId,
  });
};

export const useTrackUpsellEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (event: {
      professional_id: string;
      booking_id?: string;
      source_service_id: string;
      recommended_service_id: string;
      client_phone?: string;
      channel: string;
      status: string;
      upsell_revenue?: number;
    }) => {
      const { error } = await api
        .from("upsell_events" as any)
        .insert(event as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["upsell-events"] });
      qc.invalidateQueries({ queryKey: ["upsell-rules"] });
    },
  });
};

export const useTriggerUpsell = () => {
  return useMutation({
    mutationFn: async ({ professionalId, bookingId }: { professionalId: string; bookingId: string }) => {
      const { data, error } = await api.functions.invoke("upsell-execute", {
        body: { action: "trigger", professionalId, bookingId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.triggered) {
        toast.success("Upsell enviado via WhatsApp");
      }
    },
    onError: () => toast.error("Erro ao disparar upsell"),
  });
};
