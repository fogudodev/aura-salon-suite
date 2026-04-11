import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useProfessional } from "./useProfessional";
import { useFeatureFlags } from "./useFeatureFlags";

type Override = { feature_key: string; enabled: boolean };
const REQUIRE_GLOBAL_ENABLE = new Set(["campaigns"]);

/**
 * Checks both the global feature_flags table AND per-professional overrides.
 *
 * Logic:
 * 1. If global flag exists and is disabled → feature is disabled (unless professional override enables it)
 * 2. If professional override exists → use it
 * 3. Otherwise → enabled
 */
export const useMyFeatureGate = () => {
  const { data: professional } = useProfessional();
  const { data: globalFlags, isLoading: flagsLoading } = useFeatureFlags();

  const { data: overrides, isLoading: overridesLoading } = useQuery({
    queryKey: ["my-feature-overrides", professional?.id],
    queryFn: async () => {
      const { data, error } = await api
        .from("professional_feature_overrides" as any)
        .select("feature_key, enabled")
        .eq("professional_id", professional!.id);
      if (error) throw error;
      return (data || []) as unknown as Override[];
    },
    enabled: !!professional?.id,
  });

  const overrideMap = new Map<string, boolean>();
  (overrides || []).forEach((o) => overrideMap.set(o.feature_key, o.enabled));

  const globalFlagMap = new Map<string, boolean>();
  (globalFlags || []).forEach((f) => globalFlagMap.set(f.key, f.enabled));

  /** Returns true if the feature is disabled for this professional */
  const isFeatureDisabledForMe = (featureKey: string): boolean => {
    // Some modules require explicit global activation by master admin.
    if (REQUIRE_GLOBAL_ENABLE.has(featureKey)) {
      if (!globalFlagMap.has(featureKey)) return true;
      if (!globalFlagMap.get(featureKey)) return true;
      if (overrideMap.has(featureKey)) return !overrideMap.get(featureKey)!;
      return false;
    }

    // Professional-level override takes highest priority
    if (overrideMap.has(featureKey)) return !overrideMap.get(featureKey)!;
    // Then check global flag
    if (globalFlagMap.has(featureKey)) return !globalFlagMap.get(featureKey)!;
    // No flag registered = enabled by default
    return false;
  };

  const isFeatureEnabledForMe = (featureKey: string): boolean => !isFeatureDisabledForMe(featureKey);

  return {
    isFeatureDisabledForMe,
    isFeatureEnabledForMe,
    isLoading: flagsLoading || overridesLoading,
  };
};
