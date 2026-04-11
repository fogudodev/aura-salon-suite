import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useProfessional } from "./useProfessional";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export const useClients = () => {
  const { data: professional } = useProfessional();

  return useQuery({
    queryKey: ["clients", professional?.id],
    queryFn: async () => {
      const { data, error } = await api
        .from("clients")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });
};

export const useCreateClient = () => {
  const qc = useQueryClient();
  const { data: professional } = useProfessional();

  return useMutation({
    mutationFn: async (client: Omit<TablesInsert<"clients">, "professional_id">) => {
      const { data, error } = await api
        .from("clients")
        .insert({ ...client, professional_id: professional!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
};

export const useUpdateClient = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"clients"> & { id: string }) => {
      const { data, error } = await api
        .from("clients")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
};

export const useDeleteClient = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Preserve campaign history by detaching legacy campaign contacts before deleting the client.
      const { error: detachCampaignContactsError } = await api
        .from("campaign_contacts")
        .update({ client_id: null })
        .eq("client_id", id);
      if (detachCampaignContactsError) throw detachCampaignContactsError;

      const { error } = await api.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
};
