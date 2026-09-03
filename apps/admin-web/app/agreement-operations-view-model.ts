export type AgreementSigning = {
  available: boolean;
  supplierSigned: boolean;
  operatorSigned: boolean;
  reason: string | null;
};

export function buildAgreementAction(signing: AgreementSigning, busy: boolean) {
  if (busy) return { label: "Открываем…", disabled: true };
  if (signing.operatorSigned) return { label: "Подписано", disabled: true };
  if (!signing.available) return { label: "Подпись недоступна", disabled: true };
  return { label: "Подписать ЭЦП", disabled: false };
}

export function agreementSignatureTone(signed: boolean) {
  return signed ? "success" as const : "warning" as const;
}
