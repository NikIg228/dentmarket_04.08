"use client";

import { FormEvent, useRef, useState } from "react";
import {
  DmButton,
  DmCheckbox,
  DmDialog,
  DmFeedback,
  DmField,
  DmInput,
} from "@marketplace/ui";
import styles from "./organization-quick-create.module.css";
import { adminAuthHeaders } from "./admin-auth";

const capabilities = [
  ["BUYER", "Покупатель"],
  ["SUPPLIER", "Поставщик"],
  ["IMPORTER", "Импортёр"],
  ["LOGISTICS_PROVIDER", "Логистика"],
  ["SERVICE_PROVIDER", "Сервис"],
] as const;

export function OrganizationQuickCreate() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const triggerContainerRef = useRef<HTMLSpanElement>(null);

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setStatus("idle");
      setMessage("");
    } else {
      queueMicrotask(() =>
        triggerContainerRef.current?.querySelector("button")?.focus(),
      );
    }
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const selectedCapabilities = capabilities
      .map(([value]) => value)
      .filter((value) => form.getAll("capabilities").includes(value));
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api"}/organizations`,
        {
          method: "POST",
          headers: adminAuthHeaders(),
          body: JSON.stringify({
            legalName: form.get("legalName"),
            displayName: form.get("displayName"),
            bin: form.get("bin"),
            capabilities: selectedCapabilities,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "Организация с таким БИН уже существует."
            : "API отклонил данные организации.",
        );
      setStatus("success");
      setMessage("Организация создана. Audit и outbox записаны.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus("error");
      const detail = error instanceof Error ? error.message : "";
      setMessage(
        detail === "Failed to fetch"
          ? "API недоступен. Запустите backend и PostgreSQL."
          : detail || "Не удалось создать организацию.",
      );
    }
  }

  return (
    <>
      <span ref={triggerContainerRef}>
        <DmButton appearance="primary" type="button" onClick={() => changeOpen(true)}>
          Создать организацию
        </DmButton>
      </span>
      <DmDialog
        open={open}
        onOpenChange={changeOpen}
        title="Новая организация"
        description="Добавьте юридические реквизиты и выберите доступные кабинеты."
        actions={
          <>
            <DmButton type="button" appearance="secondary" onClick={() => changeOpen(false)}>
              Отмена
            </DmButton>
            <DmButton
              type="submit"
              form="organization-quick-create-form"
              appearance="primary"
              disabled={status === "saving"}
            >
              {status === "saving" ? "Сохранение..." : "Создать"}
            </DmButton>
          </>
        }
      >
        <form id="organization-quick-create-form" className={styles.form} onSubmit={submit}>
              <DmField label="Юридическое название" required>
                <DmInput name="legalName" required minLength={2} />
              </DmField>
              <DmField label="Название в DentMarket" required>
                <DmInput name="displayName" required minLength={2} />
              </DmField>
              <DmField label="БИН" hint="12 цифр" required>
                <DmInput
                  name="bin"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{12}"
                  maxLength={12}
                />
              </DmField>
              <fieldset>
                <legend>Возможности организации</legend>
                <div className={styles.capabilities}>
                  {capabilities.map(([value, label], index) => (
                    <DmCheckbox
                      className={styles.checkbox}
                      key={value}
                      label={label}
                      name="capabilities"
                      value={value}
                      defaultChecked={index === 0}
                    />
                  ))}
                </div>
              </fieldset>
          {message ? (
            <DmFeedback
              tone={status === "error" ? "danger" : "success"}
              title={status === "error" ? "Организация не создана" : "Организация создана"}
              description={message}
              alert={status === "error"}
            />
          ) : null}
        </form>
      </DmDialog>
    </>
  );
}
