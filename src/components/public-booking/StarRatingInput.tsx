import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type StarRatingInputProps = {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  size?: number;
  className?: string;
  activeColor?: string;
  inactiveColor?: string;
};

export function StarRatingInput({
  value,
  onChange,
  disabled = false,
  size = 26,
  className,
  activeColor = "#f59e0b",
  inactiveColor = "rgba(148, 163, 184, 0.42)",
}: StarRatingInputProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {[1, 2, 3, 4, 5].map((rating) => {
        const active = rating <= value;

        return (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => onChange(rating)}
            aria-label={rating === 1 ? "Avaliar com 1 estrela" : `Avaliar com ${rating} estrelas`}
            className="transition-transform hover:scale-105 disabled:pointer-events-none disabled:opacity-50"
          >
            <Star
              size={size}
              strokeWidth={2.2}
              className="transition-colors"
              style={{
                color: active ? activeColor : inactiveColor,
                fill: active ? activeColor : "transparent",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
