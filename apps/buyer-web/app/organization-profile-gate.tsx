"use client";
import { MarketplaceApiClient } from "@marketplace/api-client";
import type { OrganizationProfileResponse } from "@marketplace/schemas";
import { DmButton, ErrorState, LoadingState, OrganizationProfileForm, errorMessage } from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { sessionApiContext, useVerifiedSession } from "./workspace-session";

export function OrganizationProfileGate({ children }: { children: ReactNode }) {
  const { session, ready } = useVerifiedSession();
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", sessionApiContext), []);
  const [profile, setProfile] = useState<OrganizationProfileResponse | null>(null);
  const [cities, setCities] = useState<Array<{ id: string; nameRu: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!session?.organizationId) return;
    setError(null);
    try {
      const current = await api.getOrganizationProfile(); setProfile(current);
      if (!current.complete) setCities(await api.get("/catalog/cities"));
    } catch (cause) { setError(errorMessage(cause)); }
  }, [api, session?.organizationId]);
  useEffect(() => { setProfile(null); void load(); }, [load]);
  if (!ready) return <LoadingState label="Проверяем вход" />;
  if (!session) return children;
  if (error) return <ErrorState title="Не удалось проверить анкету" description={error} action={<DmButton onClick={() => void load()}>Повторить</DmButton>} />;
  if (!profile || profile.organizationId !== session.organizationId) return <LoadingState label="Проверяем анкету организации" />;
  if (profile.complete) return children;
  return <main style={{ maxWidth: 680, padding: 24, margin: "0 auto" }}>
    <h1>Завершите подключение клиники</h1><p>После сохранения вы вернётесь к выбранному товару или странице.</p>
    <OrganizationProfileForm value={profile} cities={cities} onSave={input => api.saveOrganizationProfile(input)} onSaved={setProfile} />
  </main>;
}
