import { expect, it } from "vitest";
import { parseCartQuantity } from "./cart-correction-model";
it.each([["2,5",2.5],[" 3 ",3],["0.000001",0.000001],["1000000",1000000]])("parses explicit quantity %s",(value,expected)=>expect(parseCartQuantity(String(value))).toBe(expected));
it.each(["","0","-1","1e3","1,234,5","Infinity","0.0000001","1000001","2abc"])("rejects ambiguous/invalid %s",value=>expect(parseCartQuantity(value)).toBeNull());
