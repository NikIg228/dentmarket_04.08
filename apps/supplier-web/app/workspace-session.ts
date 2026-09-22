"use client";
import { workspaceSessionStore, revokeWorkspaceSession, type ApiContext } from "@marketplace/api-client";
import { useWorkspaceSession } from "@marketplace/ui";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
export const sessionStore = workspaceSessionStore(apiUrl, "SUPPLIER");
export const sessionApiContext: ApiContext = { getAccessToken: sessionStore.getAccessToken, onUnauthorized: sessionStore.invalidate };
export const useVerifiedSession = () => useWorkspaceSession(sessionStore);
export async function logoutSession() {
  const accessToken = await sessionStore.getAccessToken();
  await revokeWorkspaceSession(apiUrl, { ...sessionStore.getSnapshot().session, accessToken });
}
