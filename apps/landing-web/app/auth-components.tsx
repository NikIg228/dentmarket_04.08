"use client";

import { DmButton } from "@marketplace/ui";
import type { AuthCapability, AuthFeedback } from "./auth-client";

export function AuthBrand({ href = "/" }: { href?: string }) {
  return (
    <a className="brand" href={href} aria-label="DentMarket KZ">
      <span aria-hidden="true">DM</span>
      <strong>
        DentMarket <small>KZ</small>
      </strong>
    </a>
  );
}

export function AuthRolePicker({
  value,
  onChange,
  disabled = false,
  registration = false,
}: {
  value: AuthCapability;
  onChange: (value: AuthCapability) => void;
  disabled?: boolean;
  registration?: boolean;
}) {
  return (
    <div className="rolePicker" role="group" aria-label="Тип кабинета">
      <DmButton
        type="button"
        appearance="secondary"
        data-selected={value === "BUYER"}
        aria-pressed={value === "BUYER"}
        disabled={disabled}
        onClick={() => onChange("BUYER")}
      >
        <b>Клиника</b>
        <span>
          {registration ? "Закупки, бюджеты и документы" : "Магазин и закупки"}
        </span>
      </DmButton>
      <DmButton
        type="button"
        appearance="secondary"
        data-selected={value === "SUPPLIER"}
        aria-pressed={value === "SUPPLIER"}
        disabled={disabled}
        onClick={() => onChange("SUPPLIER")}
      >
        <b>Поставщик</b>
        <span>
          {registration ? "Каталог, заказы и договор ЭЦП" : "Продажи и товары"}
        </span>
      </DmButton>
    </div>
  );
}

export function AuthNotice({ feedback }: { feedback: AuthFeedback }) {
  return (
    <div
      className={`authNotice authNotice-${feedback.kind}`}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      <strong>{feedback.kind === "error" ? "Нужно исправить" : "Готово"}</strong>
      <span>{feedback.message}</span>
      {feedback.requestId ? (
        <small>Код обращения: {feedback.requestId}</small>
      ) : null}
    </div>
  );
}
