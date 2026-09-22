"use client";
import { useSearchParams } from "next/navigation";
import { productReturnPath } from "@marketplace/schemas/product-navigation";

export function useProductReturn() {
  return productReturnPath(useSearchParams().get("returnTo"));
}
