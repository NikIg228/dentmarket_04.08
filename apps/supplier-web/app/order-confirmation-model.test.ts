import {describe,expect,it} from "vitest";
import {createDataOverrideSchema,confirmSupplierOrderSchema} from "@marketplace/schemas";
import {
  confirmationLineMinor,confirmationOutcomeMessage,confirmationPreview,confirmationQuantity,
  confirmationSnapshot,formatConfirmationMoney,initialConfirmationDraft,type ConfirmableOrder,
} from "./order-confirmation-model";
const item={id:"00000000-0000-4000-8000-000000000001",quantity:"3",unitPriceMinor:"9007199254740993",offer:{productVariant:{product:{canonicalName:"Материал"}}}};
const order:ConfirmableOrder={id:"order",orderNumber:"TEST",version:1,status:"AWAITING_CONFIRMATION",subtotalAmountMinor:"27021597764222979",currency:"KZT",items:[item]};

describe("confirmation preview and draft identity",()=>{
 it("proves large exact minor input is permitted by the existing contract",()=>{
  expect(createDataOverrideSchema.safeParse({target:"PRICE",offerId:item.id,mode:"PERMANENT",value:{amountMinor:item.unitPriceMinor},reason:"Test precision"}).success).toBe(true);
  expect(confirmSupplierOrderSchema.safeParse({decisions:[{itemId:item.id,acceptedQuantity:3}]}).success).toBe(true);
  const preview=confirmationPreview(order,initialConfirmationDraft(order));
  expect(preview?.total).toBe(BigInt("27021597764222979"));
  expect(formatConfirmationMoney(preview!.total,"KZT")).toBe("270\u00a0215\u00a0977\u00a0642\u00a0229,79 ₸");
 });
 it.each([["12501",1.5,BigInt("18752")],["1",0.5,BigInt("1")],["1",0.49,BigInt("0")],["10000000",1e-7,BigInt("1")],["99999999999999999999",1,BigInt("99999999999999999999")]] as const)("rounds %s × %s per line HALF_UP",(price,quantity,expected)=>{
  expect(confirmationLineMinor(price,quantity)).toBe(expected);
 });
 it("rounds each line, not only the aggregated sum",()=>{
  const input={...order,subtotalAmountMinor:"2",items:[{...item,id:"1",quantity:"1",unitPriceMinor:"1"},{...item,id:"2",quantity:"1",unitPriceMinor:"1"}]};
  expect(confirmationPreview(input,{"1":{acceptedQuantity:"0.5",reason:"Half"},"2":{acceptedQuantity:"0.5",reason:"Half"}})?.total).toBe(BigInt("2"));
 });
 it.each([""," ","-1","NaN","Infinity","4","1e1000"])("does not silently accept invalid quantity %s",value=>{
  expect(confirmationQuantity(value,"3")).toBeNull();
  expect(confirmationPreview(order,{[item.id]:{acceptedQuantity:value,reason:""}})).toBeNull();
 });
 it("does not call a zero-price full acceptance rejection",()=>{
  const free={...order,subtotalAmountMinor:"0",items:[{...item,unitPriceMinor:"0"}]};
  expect(confirmationPreview(free,initialConfirmationDraft(free))).toMatchObject({total:BigInt("0"),rejected:false,partial:false});
  expect(confirmationPreview(free,{[item.id]:{acceptedQuantity:"1",reason:"Partial"}})).toMatchObject({total:BigInt("0"),rejected:false,partial:true});
  expect(confirmationPreview(free,{[item.id]:{acceptedQuantity:"0",reason:"Rejected"}})).toMatchObject({total:BigInt("0"),rejected:true});
 });
 it("detects changed versions or price snapshots but ignores object identity",()=>{
  expect(confirmationSnapshot({...order})).toBe(confirmationSnapshot(order));
  expect(confirmationSnapshot({...order,version:2})).not.toBe(confirmationSnapshot(order));
  expect(confirmationSnapshot({...order,items:[{...item,unitPriceMinor:"1"}]})).not.toBe(confirmationSnapshot(order));
  const draft=initialConfirmationDraft(order);draft[item.id]!.acceptedQuantity="1";
  expect(item.quantity).toBe("3");
 });
 it.each([["CONFIRMED","Заказ подтверждён полностью"],["PARTIALLY_CONFIRMED","Заказ подтверждён частично, итог и резерв пересчитаны"],["REJECTED","Заказ отклонён, причины переданы клинике"]])("truthful outcome for %s",(status,message)=>expect(confirmationOutcomeMessage(status)).toBe(message));
});
