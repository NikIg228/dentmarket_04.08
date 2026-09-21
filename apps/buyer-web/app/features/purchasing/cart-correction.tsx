"use client";

import { useEffect, useRef, useState } from "react";
import { Popover, PopoverSurface, PopoverTrigger, Tooltip } from "@fluentui/react-components";
import { DmButton, DmField, DmInput } from "@marketplace/ui";
import { MarketplaceApiError, type MarketplaceApiClient } from "@marketplace/api-client";
import { parseCartQuantity } from "./cart-correction-model";
import type { Cart, CartValidation } from "./types";

type Draft = { value: string; version: number };
type Props = {
  cart: Cart | null;
  api: MarketplaceApiClient;
  onChanged: (cart: Cart) => void;
  onValidated: (value: CartValidation | null) => void;
};

export function useCartCorrection({ cart, api, onChanged, onValidated }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    // A concurrent checkout can remove the active cart. Retain the local draft
    // until the user explicitly discards it; a new cart starts a fresh editor.
    if (!cart?.id) return;
    setDrafts({}); setError(null); setNotice(null); setRemoving(null);
  }, [cart?.id]);

  const failure = (cause: unknown) => {
    if (cause instanceof MarketplaceApiError && cause.status === 409) return "Корзина изменилась или уже оформляется. Ваш ввод сохранён. Обновите корзину, проверьте сохранённое количество и повторите действие.";
    if (cause instanceof MarketplaceApiError && (cause.status === 401 || cause.status === 403)) return "Нет доступа к изменению корзины. Ваш ввод сохранён; проверьте вход и права сотрудника.";
    return "Сервер не подтвердил изменение. Ваш ввод сохранён. Обновите корзину, чтобы проверить результат, затем повторите при необходимости.";
  };
  async function validate(next: Cart) {
    onValidated(null);
    if (next.status !== "ACTIVE" || next.checkout || !next.items.length) return;
    try { onValidated(await api.validateCart(next.id)); }
    catch { setError("Корзина сохранена, но цены и остатки не проверены. Нажмите «Обновить корзину» перед оформлением."); }
  }
  function discard(id: string) { setDrafts(previous => { const next = { ...previous }; delete next[id]; return next; }); }
  function edit(id: string, value: string) {
    if (!cart || inFlight.current) return;
    setDrafts(previous => ({ ...previous, [id]: { value, version: previous[id]?.version ?? cart.version } }));
    setNotice(null);
  }
  async function reload() {
    if (!cart || inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null); setNotice(null); onValidated(null);
    try {
      const next = (await api.listCarts(cart.buyerOrganizationId)).find(candidate => candidate.id === cart.id);
      if (!next) throw new Error("Cart missing");
      onChanged(next);
      setDrafts(previous => Object.fromEntries(Object.entries(previous).map(([id, draft]) => [id, { ...draft, version: next.version }])));
      setNotice(next.checkout || next.status !== "ACTIVE"
        ? "Корзина уже оформляется или оформлена. Проверьте раздел «Заказы». Несохранённый ввод не меняет заказ и остаётся только на этом экране."
        : "Корзина обновлена. Введённое количество не применено автоматически — сравните с сохранённым и подтвердите действие.");
      await validate(next);
    } catch (cause) { setError(failure(cause)); }
    finally { inFlight.current = false; setPending(false); }
  }
  async function save(id: string, remove = false) {
    if (!cart || inFlight.current) return;
    const draft = drafts[id];
    const quantity = draft ? parseCartQuantity(draft.value) : null;
    if (!remove && quantity === null) { setError("Введите количество больше нуля, не более 1000000 и до 6 знаков после запятой. Для удаления используйте отдельную кнопку."); return; }
    inFlight.current = true; setPending(true); setError(null); setNotice(null); onValidated(null);
    try {
      const next = remove
        ? await api.removeCartItem(cart.id, id, { expectedVersion: cart.version })
        : await api.updateCartItem(cart.id, id, { expectedVersion: draft.version, quantity: quantity! });
      onChanged(next);
      setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== id).map(([key, value]) => [key, { ...value, version: next.version }])));
      setRemoving(null); setNotice(remove ? "Позиция удалена из корзины." : "Количество сохранено. Новые цены не принимаются автоматически.");
      await validate(next);
    } catch (cause) { setError(failure(cause)); }
    finally { inFlight.current = false; setPending(false); }
  }
  return { drafts, pending, error, notice, removing, setRemoving, edit, discard, reload, save, hasDrafts: Object.keys(drafts).length > 0 };
}

export function CartQuantityEditor({ id, name, quantity, editor, disabled }: {
  id: string; name: string; quantity: string; editor: ReturnType<typeof useCartCorrection>; disabled: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const draft = editor.drafts[id];
  const hadDraft = useRef(Boolean(draft));
  useEffect(() => {
    if (draft) hadDraft.current = true;
    else if (hadDraft.current && !editor.pending) {
      root.current?.querySelector('input')?.focus();
      hadDraft.current = false;
    }
  }, [draft, editor.pending]);
  const invalid = draft !== undefined && parseCartQuantity(draft.value) === null;
  return <div className="mp-stack" ref={root}>
    <DmField label={<span>Количество <Popover><PopoverTrigger disableButtonEnhancement><Tooltip content="Число единиц продажи для заказа. Изменение применяется только по кнопке «Сохранить»." relationship="description"><DmButton size="small" aria-label={`Помощь: количество ${name}`}>?</DmButton></Tooltip></PopoverTrigger><PopoverSurface>Сколько единиц продажи вы хотите заказать. Изменение применяется только по кнопке «Сохранить». Минимум и кратность проверяются по условиям поставщика.</PopoverSurface></Popover></span>}
      validationMessage={invalid ? "Число больше 0, до 1000000; не более 6 знаков после запятой." : undefined} validationState={invalid ? "error" : "none"}>
      <DmInput aria-label={`Количество: ${name}`} inputMode="decimal" value={draft?.value ?? quantity} disabled={disabled} onChange={(_, data) => editor.edit(id, data.value)} />
    </DmField>
    <small>Сохранено: {quantity}</small>
    {draft ? <div><DmButton disabled={disabled || invalid} onClick={() => void editor.save(id)}>Сохранить количество</DmButton><DmButton disabled={disabled} onClick={() => editor.discard(id)}>Отменить ввод</DmButton></div> : null}
    {editor.removing === id ? <div role="group" aria-label={`Подтверждение удаления: ${name}`}><span>Удалить эту позицию? Заказ не создаётся.</span><DmButton disabled={disabled} onClick={() => void editor.save(id, true)}>Да, удалить</DmButton><DmButton disabled={disabled} onClick={() => editor.setRemoving(null)}>Оставить</DmButton></div>
      : <DmButton disabled={disabled} onClick={() => editor.setRemoving(id)}>Удалить позицию</DmButton>}
  </div>;
}
