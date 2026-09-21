import type { Offer } from "./types";

export function offerPackaging(offer: Pick<Offer, "packaging" | "saleUnit" | "baseUnitsPerSaleUnit" | "publication">) {
  if (offer.packaging) return { name: offer.packaging.name, detail: `${offer.packaging.quantityInBaseUnit} ${offer.packaging.unit.symbol} в единице продажи`, warning: false };
  if (offer.saleUnit && offer.baseUnitsPerSaleUnit) return { name: offer.saleUnit.nameRu,
    detail: `${offer.baseUnitsPerSaleUnit} ${offer.saleUnit.symbol} в единице продажи · отдельная фасовка не назначена`, warning: false };
  return { name: "Фасовка не указана", detail: offer.publication?.marketplaceVisible
    ? "Предложение опубликовано, но данные фасовки отсутствуют. Проверьте карточку предложения."
    : "Уточните фасовку перед публикацией", warning: true };
}
