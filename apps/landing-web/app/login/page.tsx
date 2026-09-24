"use client";
import { authForgotAcceptedSchema } from "@marketplace/schemas";
import Link from "next/link";
import { withWorkspaceReturn } from "@marketplace/schemas/product-navigation";
import { useProductReturn } from "../use-product-return";

import Script from "next/script";
import { DmButton, DmField, DmInput, DmSelect } from "@marketplace/ui";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AuthBrand, AuthNotice } from "../auth-components";
import {
  type AuthCapability,
  type AuthFeedback,
  type AuthSession,
  authRequest,
  buyerAppUrl,
  feedbackFromError,
  openWorkspace,
  availableWorkspaces,
  workspaceOptions, resumeAuthSession, type WorkspaceChoice,
} from "../auth-client";

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

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const appleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";
const appleRedirectUri = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? "";

type BusyAction = "email" | "forgot" | "workspace" | "social" | null;

export default function LoginPage() {
  const returnTo = useProductReturn();
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingSession, setPendingSession] = useState<AuthSession | null>(null);
  const [choices, setChoices] = useState<WorkspaceChoice[]>([]);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const googleButton = useRef<HTMLDivElement>(null);
  const busy = busyAction !== null;
  const hasGoogle = Boolean(googleClientId);
  const hasApple = Boolean(appleClientId && appleRedirectUri);
  const hasSocialLogin = hasGoogle || hasApple;

  const continueSession = async (session: AuthSession) => {
    const workspaces = workspaceOptions(await availableWorkspaces(session));
    if (workspaces.length === 1) return openWorkspace(session, workspaces[0].capability, workspaces[0].organizationId, returnTo);
    setPendingSession(session); setChoices(workspaces); setChoiceIndex(0);
  };

  useEffect(() => {
    let active = true;
    setBusyAction("workspace");
    void resumeAuthSession().then(session => { if (active && session) return continueSession(session); })
      .catch(cause => { if (active) setFeedback(feedbackFromError(cause, "Не удалось восстановить вход")); })
      .finally(() => { if (active) setBusyAction(null); });
    return () => { active = false; };
  }, [returnTo]);

  const exchange = async (provider: "GOOGLE" | "APPLE", idToken: string) => {
    setBusyAction("social");
    setFeedback(null);
    try {
      await continueSession(
        await authRequest<AuthSession>("/auth/social/exchange", {
          provider,
          idToken,
        }),
      );
    } catch (cause) {
      setFeedback(feedbackFromError(cause, "Вход не выполнен"));
    } finally {
      setBusyAction(null);
    }
  };

  const emailLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("email");
    setFeedback(null);
    try {
      await continueSession(
        await authRequest<AuthSession>("/auth/login", { email, password }),
      );
    } catch (cause) {
      setFeedback(feedbackFromError(cause, "Вход не выполнен"));
    } finally {
      setBusyAction(null);
    }
  };

  const forgotPassword = async () => {
    if (!email) {
      setFeedback({
        kind: "error",
        message: "Сначала укажите рабочий email в поле выше.",
      });
      return;
    }
    setBusyAction("forgot");
    setFeedback(null);
    try {
      const accepted = authForgotAcceptedSchema.parse(await authRequest("/auth/password/forgot", { email }));
      setFeedback({
        kind: "success",
        message:
          accepted.delivery === "LOCAL_FILE" ? "Запрос принят. Если аккаунт существует, тестовое письмо сохранено на этом ПК в .tmp/auth-mail локального API. В интернет ничего не отправлялось; при отсутствии письма обратитесь к оператору стенда." : accepted.message,
      });
    } catch (cause) {
      setFeedback(feedbackFromError(cause, "Не удалось отправить письмо"));
    } finally {
      setBusyAction(null);
    }
  };

  const renderGoogle = () => {
    if (!hasGoogle || !window.google || !googleButton.current) return;
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
    if (!window.AppleID || !hasApple) return;
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
      setFeedback(feedbackFromError(cause, "Apple Sign In не выполнен"));
    }
  };

  return (
    <main className="loginPage">
      {hasGoogle ? (
        <Script
          src="https://accounts.google.com/gsi/client?hl=ru"
          strategy="afterInteractive"
          onLoad={renderGoogle}
        />
      ) : null}
      {hasApple ? (
        <Script
          src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/ru_RU/appleid.auth.js"
          strategy="afterInteractive"
        />
      ) : null}
      <section className="loginIntro">
        <AuthBrand href={buyerAppUrl} />
        <div>
          <p className="eyebrow">Вход в DentMarket</p>
          <h1>Продолжите работу в своём кабинете</h1>
          <p>Закупайте для клиники или управляйте продажами и заказами.</p>
        </div>
        <a className="backLink" href={buyerAppUrl}>
          ← Вернуться в магазин
        </a>
      </section>
      <section className="loginPanel" aria-labelledby="login-title">
        <div className="loginCard">
          <p className="eyebrow">Вход</p>
          <h2 id="login-title">Войдите в аккаунт</h2>
          <p>Доступные организации и кабинеты определяются после входа.</p>
          <form className="emailLoginForm" onSubmit={emailLogin}>
            <DmField label="Рабочий email" required>
              <DmInput
                type="email"
                autoComplete="email"
                value={email}
                onChange={(_, data) => setEmail(data.value)}
                disabled={busy}
                required
              />
            </DmField>
            <DmField label="Пароль" required>
              <DmInput
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(_, data) => setPassword(data.value)}
                disabled={busy}
                required
              />
            </DmField>
            <DmButton type="submit" appearance="primary" disabled={busy}>
              {busyAction === "email" ? "Входим…" : "Войти по email"}
            </DmButton>
            <DmButton
              type="button"
              appearance="subtle"
              className="linkButton"
              onClick={() => void forgotPassword()}
              disabled={busy}
            >
              {busyAction === "forgot" ? "Отправляем…" : "Забыли пароль?"}
            </DmButton>
          </form>
          {hasSocialLogin ? (
            <>
              <div className="divider">
                <span>или</span>
              </div>
              <div className="identityButtons">
                {hasGoogle ? (
                  <div ref={googleButton} className="googleButton" />
                ) : null}
                {hasApple ? (
                  <DmButton
                    type="button"
                    appearance="secondary"
                    className="appleButton"
                    onClick={() => void apple()}
                    disabled={busy}
                  >
                     Продолжить с Apple
                  </DmButton>
                ) : null}
              </div>
            </>
          ) : null}
          {pendingSession ? <div>
            <DmField label="Организация и кабинет">
              <DmSelect value={String(choiceIndex)} disabled={busy} onChange={(_, data) => setChoiceIndex(Number(data.value))}>
                {choices.map((item, index) => <option key={`${item.organizationId}:${item.capability}`} value={index}>{item.organizationDisplayName} · {item.capability === "BUYER" ? "Клиника" : "Поставщик"}</option>)}
              </DmSelect>
            </DmField>
            <DmButton disabled={busy} onClick={async () => {
              setBusyAction("workspace"); setFeedback(null);
              try { const choice = choices[choiceIndex]; if (choice) await openWorkspace(pendingSession, choice.capability, choice.organizationId, returnTo); }
              catch (cause) { setFeedback(feedbackFromError(cause, "Не удалось открыть кабинет")); }
              finally { setBusyAction(null); }
            }}>Открыть выбранную организацию</DmButton>
          </div> : null}
          <a className="backLink" href={buyerAppUrl}>Посмотреть публичный каталог</a>
          {feedback ? <AuthNotice feedback={feedback} /> : null}
          <p className="loginSignup">
            Нет аккаунта?{" "}
            <Link
              href={withWorkspaceReturn("/register", returnTo)}
            >
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
