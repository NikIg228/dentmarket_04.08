"use client";

import { ShieldLock20Regular } from "@fluentui/react-icons";
import {
  DmButton,
  DmFeedback,
  DmField,
  DmInput,
  StatusTag,
} from "@marketplace/ui";
import Script from "next/script";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  type AdminLoginMode,
  getAdminLoginCopy,
  getAdminProviderAvailability,
} from "./admin-login-view-model";
import styles from "./login.module.css";

type Provider = "GOOGLE" | "APPLE";
type PrimarySession = {
  accessToken: string;
  activeOrganizationId: string;
  user: { id: string; displayName: string; email: string };
  csrfToken?: string;
};
type MfaEnrollment = {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
};
type Elevated = {
  accessToken: string;
  activeOrganizationId: string;
  authenticationMethods: string[];
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(input: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(
            element: HTMLElement,
            options: Record<string, unknown>,
          ): void;
        };
      };
    };
    AppleID?: {
      auth: {
        init(input: Record<string, unknown>): void;
        signIn(): Promise<{ authorization: { id_token: string } }>;
      };
    };
  }
}

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const appleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";
const appleRedirectUri = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? "";

export default function AdminLogin() {
  const googleButton = useRef<HTMLDivElement>(null);
  const [primary, setPrimary] = useState<PrimarySession | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [mode, setMode] = useState<AdminLoginMode>("identity");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const providers = getAdminProviderAvailability({
    googleClientId,
    appleClientId,
    appleRedirectUri,
  });
  const copy = getAdminLoginCopy(mode);

  const request = async <T,>(path: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(primary?.accessToken
          ? { authorization: `Bearer ${primary.accessToken}` }
          : {}),
        ...init.headers,
      },
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as T & {
      message?: string;
    };
    if (!response.ok) {
      throw new Error(payload?.message ?? `HTTP ${response.status}`);
    }
    return payload;
  };

  const exchange = async (provider: Provider, idToken: string) => {
    setBusy(true);
    setError("");
    try {
      const session = await request<PrimarySession>("/auth/social/exchange", {
        method: "POST",
        body: JSON.stringify({ provider, idToken }),
      });
      if (!session.activeOrganizationId) {
        throw new Error("Для этого аккаунта не найден доступ к DentMarket.");
      }
      setPrimary(session);
      const response = await fetch(`${apiUrl}/identity/mfa`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
      });
      const status = (await response.json()) as {
        enabled?: boolean;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(status.message ?? "Не удалось проверить MFA");
      }
      if (status.enabled) {
        setMode("challenge");
      } else {
        const enrollResponse = await fetch(
          `${apiUrl}/identity/mfa/totp/enroll`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${session.accessToken}`,
              "content-type": "application/json",
            },
          },
        );
        const enroll = (await enrollResponse.json()) as MfaEnrollment & {
          message?: string;
        };
        if (!enrollResponse.ok) {
          throw new Error(enroll.message ?? "Не удалось включить MFA");
        }
        setEnrollment(enroll);
        setMode("enroll");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Вход не выполнен");
    } finally {
      setBusy(false);
    }
  };

  const renderGoogle = () => {
    if (!providers.google || !window.google || !googleButton.current) return;
    googleButton.current.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: ({ credential }) => void exchange("GOOGLE", credential),
    });
    window.google.accounts.id.renderButton(googleButton.current, {
      theme: "outline",
      size: "large",
      width: 360,
      locale: "ru",
    });
  };

  useEffect(() => {
    renderGoogle();
  }, []);

  const apple = async () => {
    if (!window.AppleID || !providers.apple) return;
    try {
      window.AppleID.auth.init({
        clientId: appleClientId,
        scope: "name email",
        redirectURI: appleRedirectUri,
        usePopup: true,
      });
      const result = await window.AppleID.auth.signIn();
      await exchange("APPLE", result.authorization.id_token);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Apple Sign In не выполнен",
      );
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!primary) return;
    setBusy(true);
    setError("");
    try {
      const code = String(
        new FormData(event.currentTarget).get("code") ?? "",
      ).trim();
      const elevated = await request<Elevated>(
        mode === "enroll"
          ? "/identity/mfa/totp/verify"
          : "/identity/mfa/challenge",
        { method: "POST", body: JSON.stringify({ code }) },
      );
      const organizationResponse = await fetch(
        `${apiUrl}/organizations/${elevated.activeOrganizationId}`,
        {
          headers: { authorization: `Bearer ${elevated.accessToken}` },
        },
      );
      const organization = (await organizationResponse.json()) as {
        capabilities?: Array<{ capability: string }>;
        message?: string;
      };
      if (
        !organizationResponse.ok ||
        !organization.capabilities?.some(
          ({ capability }) => capability === "MARKETPLACE_OPERATOR",
        )
      ) {
        throw new Error(
          "Этот раздел доступен только команде DentMarket.",
        );
      }
      sessionStorage.setItem(
        "dentmarket_admin_session",
        JSON.stringify({ ...primary, ...elevated }),
      );
      window.location.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "MFA не подтверждён");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      {providers.google ? (
        <Script
          src="https://accounts.google.com/gsi/client?hl=ru"
          strategy="afterInteractive"
          onLoad={renderGoogle}
        />
      ) : null}
      {providers.apple ? (
        <Script
          src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/ru_RU/appleid.auth.js"
          strategy="afterInteractive"
        />
      ) : null}
      <section className={styles.card} aria-labelledby="admin-login-title">
        <header className={styles.cardHeader}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>DM</span>
            <span>
              <strong>DentMarket</strong>
              <small>Операторский кабинет</small>
            </span>
          </div>
          <StatusTag tone="success">MFA</StatusTag>
        </header>

        <div className={styles.heading}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id="admin-login-title">{copy.title}</h1>
          <p>{copy.description}</p>
        </div>

        {mode === "identity" ? (
          <div className={styles.identity}>
            {providers.google ? (
              <div ref={googleButton} className={styles.google} />
            ) : null}
            {providers.apple ? (
              <DmButton
                appearance="secondary"
                className={styles.fullWidth}
                onClick={() => void apple()}
                disabled={busy}
              >
                 Продолжить с Apple
              </DmButton>
            ) : null}
            {!providers.any ? (
              <DmFeedback
                tone="warning"
                title="Корпоративный вход пока недоступен"
                description="Провайдеры Google и Apple не настроены для этого окружения. Обратитесь к администратору платформы."
              />
            ) : null}
          </div>
        ) : (
          <div className={styles.mfaStep}>
            {enrollment ? (
              <div
                className={styles.secret}
                role="note"
                aria-label="Данные для настройки MFA"
              >
                <span>Ключ приложения</span>
                <code>{enrollment.secret}</code>
                <span>Резервные коды</span>
                <small>{enrollment.recoveryCodes.join(", ")}</small>
              </div>
            ) : null}
            <form className={styles.form} onSubmit={verify}>
              <DmField
                label="Код подтверждения"
                hint="Шесть цифр из приложения или сохранённый резервный код."
                required
              >
                <DmInput
                  name="code"
                  placeholder="000000"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  disabled={busy}
                  required
                />
              </DmField>
              <DmButton type="submit" appearance="primary" disabled={busy}>
                {busy ? "Проверяем…" : "Продолжить"}
              </DmButton>
            </form>
          </div>
        )}

        {error ? (
          <DmFeedback
            tone="danger"
            title="Вход не выполнен"
            description={error}
            alert
          />
        ) : null}
        <footer>
          <ShieldLock20Regular aria-hidden="true" />
          Защищённый вход с обязательной двухфакторной проверкой
        </footer>
      </section>
    </main>
  );
}
