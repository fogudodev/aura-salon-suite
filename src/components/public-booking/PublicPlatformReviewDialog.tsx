import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { PublicPageTheme } from "@/lib/public-page-theme";
import { StarRatingInput } from "./StarRatingInput";

type PublicPlatformReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: PublicPageTheme;
  businessName: string;
  rating: number;
  comment: string;
  submitting: boolean;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
};

export function PublicPlatformReviewDialog({
  open,
  onOpenChange,
  theme,
  businessName,
  rating,
  comment,
  submitting,
  onRatingChange,
  onCommentChange,
  onSubmit,
}: PublicPlatformReviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[440px] rounded-[32px] border-0 p-0 shadow-[0_30px_90px_-34px_rgba(15,23,42,0.48)]"
        style={{ backgroundColor: theme.surface }}
      >
        <div className="overflow-hidden rounded-[32px]">
          <div className="px-6 pb-5 pt-6" style={{ background: theme.accentGradientVertical, color: theme.inverseText }}>
            <p className="inline-flex rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em]" style={{ backgroundColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.72)" }}>
              Sua opiniao importa
            </p>
            <DialogHeader className="mt-3 space-y-2 text-left">
              <DialogTitle className="text-[28px] font-black leading-[1.04] tracking-[-0.04em]">
                Como foi usar o agendamento online?
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-white/80">
                Sua avaliacao ajuda a melhorar a experiencia de quem agenda com {businessName}.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 pb-6 pt-5">
            <div className="rounded-[24px] p-4" style={{ backgroundColor: theme.surfaceMuted }}>
              <p className="text-sm font-semibold" style={{ color: theme.text }}>
                De 1 a 5 estrelas, como voce avaliaria a plataforma?
              </p>
              <StarRatingInput
                value={rating}
                onChange={onRatingChange}
                className="mt-4"
                activeColor={theme.accent}
                inactiveColor={theme.textSoft}
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.textMuted }}>
                Comentario opcional
              </label>
              <Textarea
                value={comment}
                onChange={(event) => onCommentChange(event.target.value)}
                placeholder="Conte o que funcionou bem ou o que pode melhorar."
                className="min-h-[120px] rounded-[24px] border-0 px-4 py-3 text-sm leading-6 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                style={{
                  backgroundColor: theme.surfaceMuted,
                  color: theme.text,
                }}
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-12 rounded-full border px-5 text-sm font-semibold transition"
                style={{
                  borderColor: theme.borderStrong,
                  color: theme.textMuted,
                  backgroundColor: theme.surface,
                }}
              >
                Agora nao
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="h-12 flex-1 rounded-full px-5 text-sm font-bold transition disabled:opacity-60"
                style={{
                  background: theme.accentGradient,
                  color: theme.inverseText,
                  boxShadow: `0 18px 36px -24px ${theme.accentShadow}`,
                }}
              >
                {submitting ? "Enviando..." : "Enviar avaliacao"}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
