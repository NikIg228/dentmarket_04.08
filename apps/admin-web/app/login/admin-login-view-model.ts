export type AdminLoginMode = "identity" | "challenge" | "enroll";

// Existing GET /organizations is operator-protected. Match the active tenant,
// not merely the presence of some operator organization in the returned list.
export function hasOperatorOrganizationAccess(payload: unknown, activeOrganizationId: string) {
  if (!Array.isArray(payload)) return false;
  return payload.some(item => item && typeof item === "object" &&
    item.id === activeOrganizationId && Array.isArray(item.capabilities) &&
    item.capabilities.some((entry: unknown) => entry && typeof entry === "object" &&
      "capability" in entry && entry.capability === "MARKETPLACE_OPERATOR"));
}

export function getAdminLoginCopy(mode: AdminLoginMode) {
  if (mode === "enroll") {
    return {
      eyebrow: "Первичная настройка",
      title: "Подключите двухфакторную проверку",
      description:
        "Добавьте ключ в приложение-аутентификатор, сохраните резервные коды и подтвердите настройку текущим кодом.",
    };
  }

  if (mode === "challenge") {
    return {
      eyebrow: "Второй фактор",
      title: "Подтвердите вход",
      description:
        "Введите код из приложения-аутентификатора или один из сохранённых резервных кодов.",
    };
  }

  return {
    eyebrow: "Вход для команды",
    title: "Войти в DentMarket",
    description:
      "Используйте рабочую учётную запись с доступом оператора Marketplace.",
  };
}

export function getAdminProviderAvailability({
  googleClientId,
  appleClientId,
  appleRedirectUri,
}: {
  googleClientId: string;
  appleClientId: string;
  appleRedirectUri: string;
}) {
  const google = Boolean(googleClientId.trim());
  const apple = Boolean(appleClientId.trim() && appleRedirectUri.trim());
  return { google, apple, any: google || apple };
}
