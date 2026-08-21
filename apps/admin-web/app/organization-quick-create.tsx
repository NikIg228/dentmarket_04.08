"use client";

import { FormEvent, useState } from "react";
import { DmButton, DmCheckbox, DmField, DmInput } from "@marketplace/ui";
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
      <DmButton className={styles.primaryButton} appearance="primary" type="button" onClick={() => setOpen(true)}>
        Создать организацию
      </DmButton>
      {open && (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setOpen(false)
          }
        >
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="organization-dialog-title"
          >
            <div className={styles.header}>
              <div>
                <h2 id="organization-dialog-title">Новая организация</h2>
                <p>Реквизиты и доступные кабинеты.</p>
              </div>
              <DmButton
                className={styles.closeButton}
                appearance="secondary"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
              >
                Закрыть
              </DmButton>
            </div>
            <form className={styles.form} onSubmit={submit}>
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
              {message && (
                <div
                  className={status === "error" ? styles.error : styles.success}
                  role={status === "error" ? "alert" : "status"}
                >
                  {message}
                </div>
              )}
              <div className={styles.actions}>
                <DmButton
                  type="button"
                  appearance="secondary"
                  className={styles.secondaryButton}
                  onClick={() => setOpen(false)}
                >
                  Отмена
                </DmButton>
                <DmButton
                  type="submit"
                  appearance="primary"
                  className={styles.primaryButton}
                  disabled={status === "saving"}
                >
                  {status === "saving" ? "Сохранение..." : "Создать"}
                </DmButton>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
