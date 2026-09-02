"use client";

import {
  DmButton,
  DmCheckbox,
  DmField,
  DmInput,
} from "@marketplace/ui";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AuthBrand, AuthNotice, AuthRolePicker } from "../auth-components";
import {
  type AuthCapability,
  type AuthFeedback,
  authRequest,
  feedbackFromError,
} from "../auth-client";

type RegistrationResult = {
  registrationToken: string | null;
  registration: {
    email: string;
    capability: AuthCapability;
    expiresAt: string;
  };
};

type RegistrationForm = {
  ownerDisplayName: string;
  email: string;
  password: string;
  legalName: string;
  organizationDisplayName: string;
  bin: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  marketingConsent: boolean;
};

const initialForm: RegistrationForm = {
  ownerDisplayName: "",
  email: "",
  password: "",
  legalName: "",
  organizationDisplayName: "",
  bin: "",
  termsAccepted: false,
  privacyAccepted: false,
  marketingConsent: false,
};

export default function RegisterPage() {
  const [capability, setCapability] = useState<AuthCapability>("BUYER");
  const [form, setForm] = useState(initialForm);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const role = new URLSearchParams(window.location.search).get("role");
    if (role === "supplier") setCapability("SUPPLIER");
  }, []);

  const errors = useMemo(
    () => ({
      ownerDisplayName:
        form.ownerDisplayName.trim().length >= 2
          ? undefined
          : "Укажите имя длиной не менее 2 символов.",
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
        ? undefined
        : "Укажите корректный рабочий email.",
      password:
        form.password.length >= 12
          ? undefined
          : "Пароль должен содержать не менее 12 символов.",
      legalName:
        form.legalName.trim().length >= 2
          ? undefined
          : "Укажите юридическое наименование.",
      organizationDisplayName:
        form.organizationDisplayName.trim().length >= 2
          ? undefined
          : "Укажите название, которое сотрудники увидят в кабинете.",
      bin: /^\d{12}$/.test(form.bin)
        ? undefined
        : "БИН должен содержать ровно 12 цифр.",
      consents:
        form.termsAccepted && form.privacyAccepted
          ? undefined
          : "Для регистрации примите условия использования и политику конфиденциальности.",
    }),
    [form],
  );
  const canSubmit = Object.values(errors).every((value) => !value);

  const update = <Key extends keyof RegistrationForm>(
    key: Key,
    value: RegistrationForm[Key],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const createRegistration = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setFeedback(null);
    if (!canSubmit) {
      setFeedback({
        kind: "error",
        message: "Проверьте отмеченные поля и обязательные согласия.",
      });
      return;
    }

    setBusy(true);
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const result = await authRequest<RegistrationResult>(
        "/onboarding/registrations",
        {
          ...form,
          capability,
          consentVersion: "2026-07-17",
          source: "landing_registration",
          idempotencyKey: idempotencyKey.current,
        },
      );
      if (!result.registrationToken) {
        throw new Error(
          "Эта заявка уже завершена или истекла. Войдите в аккаунт либо обратитесь в поддержку.",
        );
      }
      await authRequest("/auth/register", {
        email: form.email,
        displayName: form.ownerDisplayName,
        password: form.password,
        registrationToken: result.registrationToken,
      });
      setRegisteredEmail(result.registration.email);
    } catch (cause) {
      setFeedback(
        feedbackFromError(cause, "Не удалось создать аккаунт. Попробуйте ещё раз."),
      );
    } finally {
      setBusy(false);
    }
  };

  if (registeredEmail) {
    return (
      <main className="authUtilityPage">
        <section
          className="authUtilityCard registrationComplete"
          aria-labelledby="registration-complete-title"
        >
          <AuthBrand />
          <p className="eyebrow">Регистрация почти завершена</p>
          <div className="successMark" aria-hidden="true">
            ✓
          </div>
          <h1 id="registration-complete-title">Проверьте почту</h1>
          <p>
            Мы отправили письмо на <strong>{registeredEmail}</strong>. Перейдите
            по ссылке в письме — после подтверждения откроется кабинет{" "}
            {capability === "SUPPLIER" ? "поставщика" : "клиники"}.
          </p>
          <div className="authChecklist">
            <span>Проверьте папку «Спам», если письма нет во входящих.</span>
            <span>Ссылка ограничена по времени и используется один раз.</span>
          </div>
          <div className="registrationActions">
            <a className="primary registrationPrimary" href="/login">
              Перейти ко входу
            </a>
            <DmButton
              type="button"
              appearance="subtle"
              onClick={() => {
                setRegisteredEmail(null);
                setFeedback(null);
              }}
            >
              Исправить email
            </DmButton>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="registrationPage">
      <aside className="registrationAside">
        <AuthBrand />
        <div>
          <p className="eyebrow">Регистрация</p>
          <h1>
            {capability === "SUPPLIER"
              ? "Начните продавать клиникам Казахстана"
              : "Управляйте закупками клиники в одном месте"}
          </h1>
          <p>
            Регистрация занимает несколько минут. Мы проверим БИН и рабочий
            email, чтобы не создавать дубликаты.
          </p>
        </div>
        <ol aria-label="Этапы регистрации">
          <li data-active="true">Реквизиты организации</li>
          <li>Подтверждение email</li>
          <li>Настройка кабинета</li>
        </ol>
      </aside>
      <section className="registrationCard" aria-labelledby="register-title">
        <a className="backLink" href="/">
          ← На главную
        </a>
        <p className="eyebrow">Шаг 1 из 2</p>
        <h2 id="register-title">Создать организацию</h2>
        <p className="formLead">
          Выберите роль и укажите сведения точно как в регистрационных
          документах.
        </p>
        <AuthRolePicker
          value={capability}
          onChange={setCapability}
          disabled={busy}
          registration
        />
        <form
          onSubmit={createRegistration}
          className="registrationForm"
          noValidate
        >
          <DmField
            label="ФИО владельца"
            required
            validationState={submitted && errors.ownerDisplayName ? "error" : "none"}
            validationMessage={submitted ? errors.ownerDisplayName : undefined}
          >
            <DmInput
              value={form.ownerDisplayName}
              onChange={(_, data) => update("ownerDisplayName", data.value)}
              autoComplete="name"
              disabled={busy}
              required
            />
          </DmField>
          <DmField
            label="Рабочий email"
            required
            validationState={submitted && errors.email ? "error" : "none"}
            validationMessage={submitted ? errors.email : undefined}
          >
            <DmInput
              type="email"
              value={form.email}
              onChange={(_, data) => update("email", data.value)}
              autoComplete="email"
              disabled={busy}
              required
            />
          </DmField>
          <DmField
            label="Пароль"
            hint="Минимум 12 символов"
            required
            validationState={submitted && errors.password ? "error" : "none"}
            validationMessage={submitted ? errors.password : undefined}
          >
            <DmInput
              type="password"
              value={form.password}
              onChange={(_, data) => update("password", data.value)}
              autoComplete="new-password"
              minLength={12}
              disabled={busy}
              required
            />
          </DmField>
          <DmField
            className="wide"
            label="Юридическое наименование"
            required
            validationState={submitted && errors.legalName ? "error" : "none"}
            validationMessage={submitted ? errors.legalName : undefined}
          >
            <DmInput
              value={form.legalName}
              onChange={(_, data) => update("legalName", data.value)}
              placeholder="ТОО «Стоматология»"
              disabled={busy}
              required
            />
          </DmField>
          <DmField
            label="Название в кабинете"
            required
            validationState={
              submitted && errors.organizationDisplayName ? "error" : "none"
            }
            validationMessage={
              submitted ? errors.organizationDisplayName : undefined
            }
          >
            <DmInput
              value={form.organizationDisplayName}
              onChange={(_, data) =>
                update("organizationDisplayName", data.value)
              }
              disabled={busy}
              required
            />
          </DmField>
          <DmField
            label="БИН"
            hint="12 цифр без пробелов"
            required
            validationState={submitted && errors.bin ? "error" : "none"}
            validationMessage={submitted ? errors.bin : undefined}
          >
            <DmInput
              inputMode="numeric"
              maxLength={12}
              value={form.bin}
              onChange={(_, data) =>
                update("bin", data.value.replace(/\D/g, ""))
              }
              disabled={busy}
              required
            />
          </DmField>
          <div className="registrationConsents wide">
            <DmCheckbox
              checked={form.termsAccepted}
              onChange={(_, data) =>
                update("termsAccepted", data.checked === true)
              }
              disabled={busy}
              label={
                <span>
                  Принимаю{" "}
                  <a href="/legal/terms" target="_blank" rel="noreferrer">
                    условия использования
                  </a>
                </span>
              }
            />
            <DmCheckbox
              checked={form.privacyAccepted}
              onChange={(_, data) =>
                update("privacyAccepted", data.checked === true)
              }
              disabled={busy}
              label={
                <span>
                  Согласен с{" "}
                  <a href="/legal/privacy" target="_blank" rel="noreferrer">
                    политикой конфиденциальности
                  </a>
                </span>
              }
            />
            <DmCheckbox
              checked={form.marketingConsent}
              onChange={(_, data) =>
                update("marketingConsent", data.checked === true)
              }
              disabled={busy}
              label="Получать новости продукта (необязательно)"
            />
            {submitted && errors.consents ? (
              <p className="consentError" role="alert">
                {errors.consents}
              </p>
            ) : null}
          </div>
          {feedback ? (
            <div className="wide">
              <AuthNotice feedback={feedback} />
            </div>
          ) : null}
          <DmButton
            type="submit"
            appearance="primary"
            className="wide registrationSubmit"
            disabled={busy}
          >
            {busy ? "Создаём аккаунт…" : "Продолжить"}
          </DmButton>
          <p className="registrationMeta wide">
            После отправки мы попросим подтвердить рабочий email. Введённые
            данные сохранятся, если сервер попросит исправить форму.
          </p>
        </form>
      </section>
    </main>
  );
}
