/** Document money uses two minor-unit digits. Never coerce user money to Number. */
export function parseDocumentAmount(value: string): { minor?: string; error?: string } {
  const text = value.trim();
  if (!text) return {};
  if (text.length > 64 || !/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:[ \u00a0\u202f]\d{3})+)(?:[,.]\d{1,2})?$/.test(text)) {
    return { error: "Введите неотрицательную сумму, например 1 250,50. Не более двух знаков после запятой." };
  }
  const [whole, fraction = ""] = text.replace(/[ \u00a0\u202f]/g, "").split(/[,.]/);
  const minor = BigInt(`${whole}${fraction.padEnd(2, "0")}`).toString();
  // Document.amountMinor is Decimal(20, 0); reject instead of rounding/truncating.
  if (minor.length > 20) return { error: "Сумма слишком велика: максимум 999 999 999 999 999 999,99." };
  return { minor };
}

export function documentUploadFileError(file: Pick<File, "name" | "size"> | null): string | null {
  if (!file) return "Выберите файл PDF или DOCX.";
  if (!/\.(pdf|docx)$/i.test(file.name)) return "Поддерживаются только PDF и DOCX.";
  if (file.size === 0) return "Файл пуст. Выберите документ с содержимым.";
  if (file.size > 10_000_000) return "Размер файла не должен превышать 10 МБ (10 000 000 байт).";
  return null;
}

export function formatDocumentAmount(minor: string | null, currency: string | null): string {
  if (minor === null || !currency || !/^-?\d+$/.test(minor)) return "—";
  const value = BigInt(minor), negative = value < BigInt(0), absolute = negative ? -value : value;
  const whole = (absolute / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${negative ? "−" : ""}${whole},${(absolute % BigInt(100)).toString().padStart(2, "0")} ${currency === "KZT" ? "₸" : currency}`;
}

export function documentUploadError(error: unknown): string {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (status === 401) return "Сессия истекла. Войдите снова. Черновик сохранён до ухода со страницы.";
  if (status === 403) return "Недостаточно прав для загрузки документа. Обратитесь к администратору организации; черновик сохранён.";
  if (status === 409) return "Документ не загружен: конфликт с текущими данными или основанием. Проверьте номер и связанные записи; черновик сохранён.";
  if (status === 400 || status === 413 || status === 415) return "Сервер отклонил данные или файл. Проверьте формат, размер, номер и основание документа; черновик сохранён.";
  return "Не удалось подтвердить загрузку. Черновик сохранён. Проверьте архив перед повтором: при потере ответа файл мог сохраниться.";
}

export function documentDateValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
