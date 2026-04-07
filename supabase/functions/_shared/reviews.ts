type ProfessionalReviewLinkParams = {
  slug: string | null | undefined;
  bookingId: string;
  employeeId?: string | null;
  rating?: number | null;
};

export function buildProfessionalReviewLink(params: ProfessionalReviewLinkParams) {
  const slug = (params.slug || "").trim();
  if (!slug || !params.bookingId) return "";

  const search = new URLSearchParams({
    review: "true",
    booking: params.bookingId,
  });

  if (params.employeeId) {
    search.set("employee", params.employeeId);
  }

  if (params.rating && params.rating >= 1 && params.rating <= 5) {
    search.set("rating", String(params.rating));
  }

  return `https://gende.io/${slug}?${search.toString()}`;
}

export function buildProfessionalReviewChoices(params: ProfessionalReviewLinkParams) {
  const baseLink = buildProfessionalReviewLink(params);
  if (!baseLink) return "";

  const choices = [1, 2, 3, 4, 5].map((rating) => {
    const link = buildProfessionalReviewLink({ ...params, rating });
    const stars = "\u2B50".repeat(rating);
    const label = rating === 1 ? "1 estrela" : `${rating} estrelas`;
    return `${stars} ${label}: ${link}`;
  });

  return [
    "Escolha abaixo quantas estrelas representam sua experiencia:",
    ...choices,
    "Depois voce ainda pode deixar um comentario opcional.",
  ].join("\n");
}
