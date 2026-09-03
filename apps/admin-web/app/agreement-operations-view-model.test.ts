import { describe, expect, it } from "vitest";
import {
  agreementSignatureTone,
  buildAgreementAction,
  type AgreementSigning,
} from "./agreement-operations-view-model";

const pending: AgreementSigning = {
  available: true,
  supplierSigned: true,
  operatorSigned: false,
  reason: null,
};

describe("agreement operation state", () => {
  it("keeps the signing action available only for a signable agreement", () => {
    expect(buildAgreementAction(pending, false)).toEqual({
      label: "Подписать ЭЦП",
      disabled: false,
    });
    expect(buildAgreementAction({ ...pending, available: false }, false)).toEqual({
      label: "Подпись недоступна",
      disabled: true,
    });
  });

  it("locks the action while opening and after operator signature", () => {
    expect(buildAgreementAction(pending, true).label).toBe("Открываем…");
    expect(buildAgreementAction({ ...pending, operatorSigned: true }, false)).toEqual({
      label: "Подписано",
      disabled: true,
    });
  });

  it("uses text-backed warning and success states for signatures", () => {
    expect(agreementSignatureTone(false)).toBe("warning");
    expect(agreementSignatureTone(true)).toBe("success");
  });
});
