export function canSubmitProductCorrection({
  busy,
  productId,
  proposedValue,
  reason,
}: {
  busy: boolean;
  productId: string;
  proposedValue: string;
  reason: string;
}) {
  return (
    !busy &&
    productId.trim().length > 0 &&
    proposedValue.trim().length >= 2 &&
    reason.trim().length >= 10
  );
}
