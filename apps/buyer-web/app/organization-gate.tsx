"use client";
import dynamic from "next/dynamic";
import { LoadingState } from "@marketplace/ui";
import type { ReactNode } from "react";
import { useBuyerSession } from "./use-buyer-session";

const ProfileGate = dynamic(() => import("./organization-profile-gate").then(module => module.OrganizationProfileGate), { ssr: false, loading: () => <LoadingState label="Проверяем анкету организации" /> });

export function OrganizationGate({ children }: { children: ReactNode }) {
  const { session, ready } = useBuyerSession();
  if (!ready) return <LoadingState label="Проверяем вход" />;
  return session ? <ProfileGate>{children}</ProfileGate> : children;
}
