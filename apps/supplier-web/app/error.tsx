"use client";
import { DmButton, ErrorState } from "@marketplace/ui";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Не удалось загрузить страницу" description="Сервис временно недоступен. Повторите загрузку после восстановления соединения." action={<DmButton onClick={reset}>Повторить загрузку</DmButton>} />;
}
