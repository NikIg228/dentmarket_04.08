"use client";

import { DmButton, DmField, DmInput } from "@marketplace/ui";
import { authClientOptionsSchema, registrationResumeRequestSchema, type RegistrationResumeDetails } from "@marketplace/schemas";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AuthBrand, AuthNotice, AuthRolePicker } from "../../auth-components";
import { apiUrl, type AuthCapability, type AuthFeedback, feedbackFromError } from "../../auth-client";
import { completeResume, inspectResume, requestResume } from "./client";
import { observeResumeToken } from "./resume-fragment";

export default function ResumeRegistrationPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => observeResumeToken(window, setToken), []);
  // A different proof starts a fresh form; old passwords/results must not cross targets.
  return <ResumeRegistrationForm key={token ?? "loading"} token={token} />;
}

function ResumeRegistrationForm({ token }: { token: string | null }) {
  const [details, setDetails] = useState<RegistrationResumeDetails | null>(null);
  const [email, setEmail] = useState("");
  const [bin, setBin] = useState("");
  const [capability, setCapability] = useState<AuthCapability>("BUYER");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [complete, setComplete] = useState(false);
  const [reload, setReload] = useState(0);
  const [localMail, setLocalMail] = useState(false);
  const inFlight = useRef(false);
  const completedHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (token !== "") return;
    let active = true;
    void fetch(`${apiUrl}/auth/client-options`, { cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const options = authClientOptionsSchema.parse(await response.json());
      if (active) setLocalMail(options.emailDelivery === "LOCAL_FILE");
    }).catch(() => { /* Optional delivery hint; the request retains its own error handling. */ });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setBusy(true); setFeedback(null);
    inspectResume(token).then((value) => {
      if (!active) return;
      setDetails(value); setComplete(value.status === "COMPLETED");
    }).catch((cause) => { if (active) setFeedback(feedbackFromError(cause, "Не удалось проверить ссылку. Повторите проверку.")); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [token, reload]);
  useEffect(() => { if (complete) completedHeading.current?.focus(); }, [complete]);

  const errors = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? undefined : "Укажите email из исходной заявки.",
    bin: /^\d{12}$/.test(bin) ? undefined : "Укажите БИН из 12 цифр.",
    password: password.length >= 12 && password.length <= 128 ? undefined : "Пароль должен содержать 12–128 символов.",
    confirmation: password === confirmation ? undefined : "Пароли не совпадают.",
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || busy) return;
    setSubmitted(true); setFeedback(null);
    if (!token && !registrationResumeRequestSchema.safeParse({ email, bin, capability }).success) return;
    if (token && (!details || errors.password || (details.passwordMode === "NEW" && errors.confirmation))) return;
    inFlight.current = true; setBusy(true);
    try {
      if (token && details) {
        await completeResume({ token, email: details.email, bin: details.bin, capability: details.capability, password });
        setComplete(true); setPassword(""); setConfirmation("");
      } else {
        await requestResume({ email, bin, capability });
        setFeedback({ kind: "success", message: localMail ? "Запрос принят. Если данные совпадают с активной заявкой, тестовое письмо сохранено на этом ПК в .tmp/auth-mail локального API. Во внешний ящик оно не отправляется. Откройте ссылку из JSON-файла или попросите тестового оператора. Ссылка действует до 15 минут; повторный запрос возможен через минуту." : "Запрос принят. Если данные совпадают с активной заявкой, письмо передано на доставку. Проверьте почту и папку «Спам». Ссылка действует до 15 минут; повторный запрос возможен через минуту. Если письма нет, обратитесь к оператору." });
      }
    } catch (cause) { setFeedback(feedbackFromError(cause, "Операция не подтверждена. Повторите попытку; новая заявка не требуется.")); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <main className="authUtilityPage"><section className="authUtilityCard" aria-labelledby="resume-title">
    <AuthBrand />
    <p className="eyebrow">Незавершённая регистрация</p>
    <h1 id="resume-title" ref={completedHeading} tabIndex={-1}>{complete ? "Регистрация завершена" : "Продолжить регистрацию"}</h1>
    {complete ? <>
      <p className="authUtilityLead">Аккаунт и организация созданы. Войдите с email заявки и своим паролем. Повторное открытие ссылки не создаёт новую организацию.</p>
      <a className="authBackLink" href="/login">Перейти ко входу</a>
    </> : <>
      <p className="authUtilityLead">{token ? "Проверьте исходную заявку. Её email, БИН, роль и согласия не изменяются." : "Закрыли страницу до завершения? Укажите данные начатой заявки — создавать её повторно не нужно. Продолжение доступно только после подтверждения владения email."}</p>
      {token === null || (token && busy && !details) ? <p role="status">Проверяем ссылку…</p> : null}
      {token === "" ? <form onSubmit={submit} className="passwordForm" noValidate>
        <AuthRolePicker value={capability} onChange={setCapability} disabled={busy} />
        <DmField label="Email заявки" hint="Рабочий email, указанный при регистрации. На него придёт защищённая ссылка." required validationState={submitted && errors.email ? "error" : "none"} validationMessage={submitted ? errors.email : undefined}>
          <DmInput type="email" value={email} maxLength={254} autoComplete="email" disabled={busy} onChange={(_, data) => setEmail(data.value)} />
        </DmField>
        <DmField label="БИН организации" hint="Ровно 12 цифр из исходной заявки. БИН не заменяет подтверждение email." required validationState={submitted && errors.bin ? "error" : "none"} validationMessage={submitted ? errors.bin : undefined}>
          <DmInput value={bin} inputMode="numeric" maxLength={12} disabled={busy} onChange={(_, data) => setBin(data.value)} />
        </DmField>
        <DmButton type="submit" appearance="primary" disabled={busy}>{busy ? "Принимаем запрос…" : "Получить ссылку"}</DmButton>
      </form> : null}
      {token && details ? <>
        <dl><dt>Организация</dt><dd>{details.organizationDisplayName}</dd><dt>Email</dt><dd>{details.email}</dd><dt>БИН</dt><dd>{details.bin}</dd><dt>Роль</dt><dd>{details.capability === "BUYER" ? "Клиника" : "Поставщик"}</dd></dl>
        <form onSubmit={submit} className="passwordForm" noValidate>
          <DmField label={details.passwordMode === "NEW" ? "Пароль аккаунта" : "Текущий пароль"} hint={details.passwordMode === "NEW" ? "12–128 символов. Пароль с потерянной страницы не сохранялся; задайте его заново." : "Аккаунт уже существует. Ссылка не меняет его пароль; введите действующий."} required validationState={submitted && errors.password ? "error" : "none"} validationMessage={submitted ? errors.password : undefined}>
            <DmInput type="password" value={password} maxLength={128} autoComplete={details.passwordMode === "NEW" ? "new-password" : "current-password"} disabled={busy} onChange={(_, data) => setPassword(data.value)} />
          </DmField>
          {details.passwordMode === "NEW" ? <DmField label="Повторите пароль" required validationState={submitted && errors.confirmation ? "error" : "none"} validationMessage={submitted ? errors.confirmation : undefined}>
            <DmInput type="password" value={confirmation} maxLength={128} autoComplete="new-password" disabled={busy} onChange={(_, data) => setConfirmation(data.value)} />
          </DmField> : <a href="/login">Забыли пароль? Восстановите доступ на странице входа</a>}
          <DmButton type="submit" appearance="primary" disabled={busy}>{busy ? "Завершаем регистрацию…" : "Завершить регистрацию"}</DmButton>
        </form>
      </> : null}
      {feedback ? <AuthNotice feedback={feedback} /> : null}
      {token && !details && !busy ? <DmButton onClick={() => setReload((value) => value + 1)}>Повторить проверку ссылки</DmButton> : null}
      {token ? <a className="authBackLink" href="/register/resume">Запросить новую ссылку</a> : null}
      <a className="authBackLink" href="/login">Уже зарегистрированы? Войти</a>
      <a className="authBackLink" href="/register">Срок исходной заявки истёк? Новая регистрация</a>
    </>}
  </section></main>;
}
