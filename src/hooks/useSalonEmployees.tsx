import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useProfessional } from "./useProfessional";
import { toast } from "sonner";

export interface SalonEmployee {
  id: string;
  salon_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  specialty: string | null;
  is_active: boolean;
  has_login: boolean;
  commission_percentage: number;
  created_at: string;
  updated_at: string;
}

type EmployeeMutationInput = {
  name: string;
  email?: string;
  phone?: string;
  specialty?: string;
  commission_percentage?: number;
  is_active?: boolean;
  has_login?: boolean;
  role?: string;
};

const isLikelySchemaMismatch = (message: string) => /database error|unknown column|er_bad_field_error/i.test(message);

const buildEmployeeInsertPayload = (employee: EmployeeMutationInput, compatibilityMode = false) => {
  const payload: Record<string, any> = {
    name: employee.name.trim(),
    email: employee.email || null,
    phone: employee.phone || null,
    commission_percentage: employee.commission_percentage ?? 0,
    is_active: employee.is_active ?? true,
  };

  if (!compatibilityMode) {
    payload.specialty = employee.specialty || null;
    if (employee.has_login !== undefined) payload.has_login = employee.has_login;
    if (employee.role) payload.role = employee.role;
  }

  return payload;
};

const buildEmployeeUpdatePayload = (employee: Partial<EmployeeMutationInput>, compatibilityMode = false) => {
  const payload: Record<string, any> = {};

  if (employee.name !== undefined) payload.name = employee.name.trim();
  if (employee.email !== undefined) payload.email = employee.email || null;
  if (employee.phone !== undefined) payload.phone = employee.phone || null;
  if (employee.commission_percentage !== undefined) payload.commission_percentage = employee.commission_percentage;
  if (employee.is_active !== undefined) payload.is_active = employee.is_active;

  if (!compatibilityMode) {
    if (employee.specialty !== undefined) payload.specialty = employee.specialty || null;
    if (employee.has_login !== undefined) payload.has_login = employee.has_login;
    if (employee.role !== undefined) payload.role = employee.role;
  }

  return payload;
};

export const useSalonEmployees = () => {
  const { data: professional } = useProfessional();

  const query = useQuery({
    queryKey: ["salon-employees", professional?.id],
    queryFn: async () => {
      const { data, error } = await api
        .from("salon_employees")
        .select("*")
        .eq("salon_id", professional!.id)
        .order("name");
      if (error) throw error;
      return data as SalonEmployee[];
    },
    enabled: !!professional?.id,
  });

  return query;
};

export const useCreateSalonEmployee = () => {
  const queryClient = useQueryClient();
  const { data: professional } = useProfessional();

  return useMutation({
    mutationFn: async (employee: EmployeeMutationInput) => {
      const compatibilityMode = isPhpBackend();
      const preferredPayload = buildEmployeeInsertPayload(employee, compatibilityMode);

      let { data, error } = await api
        .from("salon_employees")
        .insert({ ...preferredPayload, salon_id: professional!.id } as any);

      if (error && !compatibilityMode && isLikelySchemaMismatch(error.message)) {
        const fallbackPayload = buildEmployeeInsertPayload(employee, true);
        const retry = await api
          .from("salon_employees")
          .insert({ ...fallbackPayload, salon_id: professional!.id } as any);
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salon-employees"] });
      toast.success("Funcionário adicionado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao adicionar funcionário: " + error.message);
    },
  });
};

export const useUpdateSalonEmployee = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalonEmployee> & { id: string }) => {
      const compatibilityMode = isPhpBackend();
      const preferredPayload = buildEmployeeUpdatePayload(updates as Partial<EmployeeMutationInput>, compatibilityMode);

      let { data, error } = await api
        .from("salon_employees")
        .update(preferredPayload)
        .eq("id", id);

      if (error && !compatibilityMode && isLikelySchemaMismatch(error.message)) {
        const fallbackPayload = buildEmployeeUpdatePayload(updates as Partial<EmployeeMutationInput>, true);
        const retry = await api
          .from("salon_employees")
          .update(fallbackPayload)
          .eq("id", id);
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salon-employees"] });
      toast.success("Funcionário atualizado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });
};

export const useDeleteSalonEmployee = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api
        .from("salon_employees")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salon-employees"] });
      toast.success("Funcionário removido!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao remover: " + error.message);
    },
  });
};
