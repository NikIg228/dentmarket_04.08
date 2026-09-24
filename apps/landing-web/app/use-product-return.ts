"use client";
import { useSearchParams } from "next/navigation";
import { workspaceReturnPath } from "@marketplace/schemas/product-navigation";

export function useProductReturn() {
  return workspaceReturnPath(useSearchParams().get("returnTo"));
}
