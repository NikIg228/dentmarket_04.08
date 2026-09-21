import { expect, it } from "vitest";
import { uploadDocumentSchema } from "./index.js";
const input = {ownerOrganizationId:"00000000-0000-4000-8000-000000000030",kind:"OTHER",format:"PDF",title:"Тестовый документ",documentNumber:"AUD07-1",fileName:"test.pdf",contentBase64:"JVBERi0xLjQ=",currency:"KZT"};
it.each(["0","125","9007199254740993","99999999999999999999"])("keeps canonical document minor units exact: %s", amountMinor => {
  expect(uploadDocumentSchema.parse({...input,amountMinor}).amountMinor).toBe(amountMinor);
});
it.each(["1,25","1.25","1 250","1e3","-125"])("rejects unconverted user money: %s", amountMinor => {
  expect(uploadDocumentSchema.safeParse({...input,amountMinor}).success).toBe(false);
});
