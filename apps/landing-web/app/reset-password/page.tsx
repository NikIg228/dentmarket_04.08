"use client";

import { DmButton, DmField, DmInput } from "@marketplace/ui";
import { type FormEvent, useEffect, useState } from "react";
import { AuthBrand, AuthNotice } from "../auth-components";
import {
  type AuthFeedback,
  authRequest,
  feedbackFromError,
} from "../auth-client";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  const passwordError =
    password.length >= 12
      ? undefined
      : "Пароль должен содержать не менее 12 символов.";
  const confirmationError =
    password === confirmation ? undefined : "Пароли не совпадают.";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setFeedback(null);
    if (!token) {
      setFeedback({
        kind: "error",
        message: "В ссылке отсутствует токен восстановления.",
      });
      return;
    }
    if (passwordError || confirmationError) return;

    setBusy(true);
    try {
      await authRequest("/auth/password/reset", { token, password });
      setCompleted(true);
      setPassword("");
      setConfirmation("");
      setFeedback({
        kind: "success",
        message:
          "Пароль изменён, а старые активные сессии завершены. Теперь войдите заново.",
      });
    } catch (cause) {
      setFeedback(feedbackFromError(cause, "Не удалось изменить пароль"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="authUtilityPage">
      <section className="authUtilityCard" aria-labelledby="reset-title">
        <AuthBrand />
        <p className="eyebrow">Безопасность аккаунта</p>
        <h1 id="reset-title">Новый пароль</h1>
        <p className="authUtilityLead">
          Создайте новый пароль. После сохранения все прежние сессии будут
          завершены.
        </p>
        {!completed ? (
          <form onSubmit={submit} className="passwordForm" noValidate>
            <DmField
              label="Новый пароль"
              hint="Минимум 12 символов"
              required
              validationState={
                submitted && passwordError ? "error" : "none"
              }
              validationMessage={submitted ? passwordError : undefined}
            >
              <DmInput
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={password}
                onChange={(_, data) => setPassword(data.value)}
                disabled={busy || !token}
                required
              />
            </DmField>
            <DmField
              label="Повторите пароль"
              required
              validationState={
                submitted && confirmationError ? "error" : "none"
              }
              validationMessage={submitted ? confirmationError : undefined}
            >
              <DmInput
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={confirmation}
                onChange={(_, data) => setConfirmation(data.value)}
                disabled={busy || !token}
                required
              />
            </DmField>
            <DmButton type="submit" appearance="primary" disabled={busy || !token}>
              {busy ? "Сохраняем…" : "Изменить пароль"}
            </DmButton>
          </form>
        ) : null}
        {token === "" ? (
          <AuthNotice
            feedback={{
              kind: "error",
              message:
                "Ссылка восстановления неполная. Запросите новое письмо на странице входа.",
            }}
          />
        ) : feedback ? (
          <AuthNotice feedback={feedback} />
        ) : null}
        <a className="authBackLink" href="/login">
          Вернуться ко входу
        </a>
      </section>
    </main>
  );
}
