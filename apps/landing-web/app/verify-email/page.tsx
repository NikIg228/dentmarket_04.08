"use client";

import { DmButton, LoadingState } from "@marketplace/ui";
import { useEffect, useRef, useState } from "react";
import { AuthBrand, AuthNotice } from "../auth-components";
import {
  type AuthFeedback,
  type AuthSession,
  authRequest,
  feedbackFromError,
  openWorkspace,
} from "../auth-client";

export default function VerifyEmailPage() {
  const [checking, setChecking] = useState(true);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const started = useRef(false);
  const verifiedSession = useRef<AuthSession | null>(null);

  const continueToWorkspace = async (session: AuthSession) => {
    setChecking(true);
    setFeedback(null);
    try {
      await openWorkspace(session);
    } catch (cause) {
      setFeedback(
        feedbackFromError(
          cause,
          "Email подтверждён, но кабинет не открылся. Повторите переход.",
        ),
      );
      setChecking(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFeedback({
        kind: "error",
        message:
          "Ссылка подтверждения неполная. Откройте ссылку из письма ещё раз.",
      });
      setChecking(false);
      return;
    }

    void authRequest<AuthSession>("/auth/email/verify", { token })
      .then(async (session) => {
        verifiedSession.current = session;
        await continueToWorkspace(session);
      })
      .catch((cause: unknown) => {
        setFeedback(
          feedbackFromError(cause, "Не удалось подтвердить рабочий email"),
        );
        setChecking(false);
      });
  }, []);

  return (
    <main className="authUtilityPage">
      <section className="authUtilityCard" aria-labelledby="verify-title">
        <AuthBrand />
        <p className="eyebrow">Подтверждение email</p>
        <h1 id="verify-title">
          {checking ? "Проверяем ссылку" : "Нужна ваша помощь"}
        </h1>
        {checking ? (
          <LoadingState label="Подтверждаем email и открываем кабинет" />
        ) : feedback ? (
          <AuthNotice feedback={feedback} />
        ) : null}
        {!checking && verifiedSession.current ? (
          <DmButton
            type="button"
            appearance="primary"
            onClick={() => void continueToWorkspace(verifiedSession.current!)}
          >
            Повторить переход в кабинет
          </DmButton>
        ) : null}
        {!checking && !verifiedSession.current ? (
          <p className="authUtilityLead">
            Если ссылка истекла, войдите с вашим email и запросите восстановление
            доступа либо повторите регистрацию.
          </p>
        ) : null}
        {!checking ? (
          <a className="authBackLink" href="/login">
            Перейти ко входу
          </a>
        ) : null}
      </section>
    </main>
  );
}
