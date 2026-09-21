import { expect, it } from "vitest";
import { offerPackaging } from "./offer-packaging";
const published = { status: "PUBLISHED", marketplaceVisible: true, blockedReason: null };
it("shows an explicit packaging before the fallback sale unit", () => {
  expect(offerPackaging({packaging:{name:"Коробка",quantityInBaseUnit:"100",unit:{symbol:"шт"}},publication:published}).detail).toBe("100 шт в единице продажи");
});
it("explains legacy sale units without falsely asking an already published offer to publish", () => {
  const result=offerPackaging({packaging:null,saleUnit:{nameRu:"Штука",symbol:"шт"},baseUnitsPerSaleUnit:"10",publication:published});
  expect(result.name).toBe("Штука"); expect(result.detail).toContain("10 шт"); expect(result.detail).not.toContain("перед публикацией");
});
it("reports missing published metadata as a data problem, not a fabricated pack", () => {
  expect(offerPackaging({packaging:null,publication:published})).toEqual({name:"Фасовка не указана",detail:"Предложение опубликовано, но данные фасовки отсутствуют. Проверьте карточку предложения.",warning:true});
  expect(offerPackaging({packaging:null,publication:null}).detail).toBe("Уточните фасовку перед публикацией");
});
