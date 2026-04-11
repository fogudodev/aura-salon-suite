import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { Sparkles, Plus, Check } from "lucide-react";

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  description: string | null;
};

type Suggestion = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  promoMessage: string | null;
  promoPrice: number | null;
};

type SuggestionApiItem = {
  service?: {
    id?: string;
    name?: string;
    price?: number;
    duration_minutes?: number;
  } | null;
  promo_message?: string | null;
  promo_price?: number | null;
};

interface UpsellSuggestionsProps {
  professionalId: string;
  professionalSlug?: string;
  sourceServiceId: string;
  clientPhone?: string;
  services: Service[];
  accent: string;
  textPrimary: string;
  textSecondary: string;
  onAddService: (service: Service, promoPrice?: number | null) => void;
  addedServiceIds: string[];
}

const UpsellSuggestions = ({
  professionalId,
  professionalSlug,
  sourceServiceId,
  clientPhone,
  services,
  accent,
  textPrimary,
  textSecondary,
  onAddService,
  addedServiceIds,
}: UpsellSuggestionsProps) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        const { data, error } = await api.functions.invoke("upsell-suggest", {
          body: {
            slug: professionalSlug || null,
            professionalId,
            sourceServiceId,
            clientPhone: clientPhone || null,
          },
        });

        if (!error && data?.suggestions?.length > 0) {
          const aiSuggestions = (data.suggestions as SuggestionApiItem[]).map((s) => ({
            id: s.service?.id || "",
            name: s.service?.name || "",
            price: s.service?.price || 0,
            duration_minutes: s.service?.duration_minutes || 0,
            promoMessage: s.promo_message || null,
            promoPrice: s.promo_price || null,
          })).filter((s: Suggestion) => s.id);

          setSuggestions(aiSuggestions);
        } else {
          setSuggestions([]);
        }
      } catch {
        // Silently fail - upsell is not critical
        setSuggestions([]);
      }

      setLoading(false);
    };

    if (professionalId && sourceServiceId) fetchSuggestions();
  }, [professionalId, professionalSlug, sourceServiceId, clientPhone]);

  if (loading || suggestions.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl p-4" style={{ background: `${accent}08`, border: `1px solid ${accent}20` }}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} style={{ color: accent }} />
        <p className="text-xs font-semibold" style={{ color: accent }}>
          Clientes que fazem este serviço também costumam adicionar:
        </p>
      </div>
      <div className="space-y-2">
        {suggestions.map(svc => {
          const isAdded = addedServiceIds.includes(svc.id);
          const displayPrice = svc.promoPrice ?? svc.price;
          const hasPromo = svc.promoPrice !== null && svc.promoPrice < svc.price;

          return (
            <div
              key={svc.id}
              className="flex items-center gap-3 p-3 rounded-xl transition-all"
              style={{
                background: isAdded ? `${accent}15` : "rgba(255,255,255,0.8)",
                border: `1px solid ${isAdded ? accent + "40" : accent + "15"}`,
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: textPrimary }}>{svc.name}</p>
                <div className="flex items-center gap-2">
                  {hasPromo && (
                    <span className="text-xs line-through" style={{ color: textSecondary }}>
                      R$ {Number(svc.price).toFixed(2)}
                    </span>
                  )}
                  <span className="text-sm font-bold" style={{ color: accent }}>
                    R$ {Number(displayPrice).toFixed(2)}
                  </span>
                  {hasPromo && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: accent }}>
                      PROMO
                    </span>
                  )}
                </div>
                {svc.promoMessage && (
                  <p className="text-[11px] mt-0.5" style={{ color: textSecondary }}>{svc.promoMessage}</p>
                )}
              </div>
              <button
                onClick={() => !isAdded && onAddService(
                  { id: svc.id, name: svc.name, price: svc.price, duration_minutes: svc.duration_minutes, description: null },
                  svc.promoPrice
                )}
                disabled={isAdded}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                style={{
                  background: isAdded ? `${accent}20` : accent,
                  color: isAdded ? accent : "white",
                }}
              >
                {isAdded ? <Check size={14} /> : <Plus size={14} />}
                {isAdded ? "Adicionado" : "Adicionar"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UpsellSuggestions;
