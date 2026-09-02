import { NcalayerError } from "@marketplace/eds-client";

export type AgreementSigningMode = "LOCAL_NCALAYER" | "REMOTE_GATEWAY";

type SigningSession = {
  signature: { id: string; status: string };
  signingUrl?: string | null;
};

export function agreementSigningMode(userAgent: string): AgreementSigningMode {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ? "REMOTE_GATEWAY" : "LOCAL_NCALAYER";
}

export function agreementSigningStep(mode: AgreementSigningMode, session: SigningSession) {
  if (mode === "REMOTE_GATEWAY") {
    if (!session.signingUrl) throw new Error("Шлюз удалённой подписи не вернул ссылку на подписание.");
    return { kind: "redirect" as const, url: session.signingUrl };
  }
  if (session.signature.status === "SESSION_CREATED") {
    return { kind: "local" as const, signatureId: session.signature.id };
  }
  return { kind: "refresh" as const };
}

export function signingErrorMessage(error: unknown) {
  if (error instanceof NcalayerError) {
    if (error.code === "USER_CANCELLED") return "Подписание отменено. Документ не изменён — можно повторить попытку.";
    if (["NCALAYER_UNAVAILABLE", "NCALAYER_CONNECTION_FAILED", "NCALAYER_CONNECTION_CLOSED"].includes(error.code)) {
      return "Не удалось подключиться к NCALayer. Запустите приложение NCALayer и повторите подписание.";
    }
    if (error.code === "NCALAYER_TIMEOUT") return "NCALayer не ответил вовремя. Проверьте приложение и повторите попытку.";
    if (error.code === "SIGNATURE_MISSING") return "NCALayer не вернул подписанный контейнер. Повторите подписание.";
  }
  return error instanceof Error ? error.message : "Не удалось подписать договор. Повторите попытку.";
}
