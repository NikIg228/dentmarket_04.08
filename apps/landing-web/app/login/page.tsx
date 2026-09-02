"use client";

import Script from "next/script";
import { DmButton, DmField, DmInput } from "@marketplace/ui";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AuthBrand, AuthNotice, AuthRolePicker } from "../auth-components";
import {
  type AuthCapability,
  type AuthFeedback,
  type AuthSession,
  authRequest,
  buyerAppUrl,
  feedbackFromError,
  openWorkspace,
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

type BusyAction = "email" | "forgot" | "demo" | "social" | null;

export default function LoginPage() {
  const [capability, setCapability] = useState<AuthCapability>("BUYER");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const googleButton = useRef<HTMLDivElement>(null);
  const busy = busyAction !== null;
  const hasGoogle = Boolean(googleClientId);
  const hasApple = Boolean(appleClientId && appleRedirectUri);
  const hasSocialLogin = hasGoogle || hasApple;

  const exchange = async (provider: "GOOGLE" | "APPLE", idToken: string) => {
    setBusyAction("social");
    setFeedback(null);
    try {
      await openWorkspace(
        await authRequest<AuthSession>("/auth/social/exchange", {
          provider,
          idToken,
        }),
        capability,
      );
    } catch (cause) {
      setFeedback(feedbackFromError(cause, "Вход не выполнен"));
    } finally {
      setBusyAction(null);
    }
  };

  const demo = async () => {
    setBusyAction("demo");
    setFeedback(null);
    try {
      await openWorkspace(
        await authRequest<AuthSession>("/auth/demo", { capability }),
        capability,
      );
    } catch (cause) {
      setFeedback(feedbackFromError(cause, "Не удалось открыть кабинет"));
    } finally {
      setBusyAction(null);
    }
  };

  const emailLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("email");
    setFeedback(null);
    try {
      await openWorkspace(
        await authRequest<AuthSession>("/auth/login", { email, password }),
        capability,
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
      await authRequest("/auth/password/forgot", { email });
      setFeedback({
        kind: "success",
        message:
          "Если аккаунт существует, мы отправили ссылку для восстановления пароля.",
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
          <h2 id="login-title">Выберите кабинет</h2>
          <AuthRolePicker
            value={capability}
            onChange={setCapability}
            disabled={busy}
          />
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
          <div className="divider">
            <span>посмотреть без регистрации</span>
          </div>
          <DmButton
            type="button"
            appearance="primary"
            className="demoLogin"
            onClick={() => void demo()}
            disabled={busy}
          >
            {busyAction === "demo"
              ? "Открываем кабинет…"
              : capability === "BUYER"
                ? "Посмотреть магазин"
                : "Посмотреть кабинет поставщика"}
          </DmButton>
          {feedback ? <AuthNotice feedback={feedback} /> : null}
          <p className="loginSignup">
            Нет аккаунта?{" "}
            <a
              href={`/register?role=${capability === "BUYER" ? "buyer" : "supplier"}`}
            >
              Зарегистрироваться
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
