"use client";

import { Cart24Regular } from "@fluentui/react-icons/svg/cart";
import {
  MarketplaceApiClient,
  parseSessionHandoff,
  type ApiContext,
} from "@marketplace/api-client";
import {
  DmButton,
  DmDialog,
  StatusTag,
  errorMessage,
  formatMoney,
} from "@marketplace/ui";
import { useMemo, useRef, useState } from "react";
import type { Cart } from "../../features/purchasing/types";
import { loginUrl } from "../../public-links";
import styles from "./page.module.css";

type Offer = {
  id: string;
  supplier: { name: string };
  priceMinor: number | string | null;
  currency: string;
  packaging?: { name: string };
  available: boolean;
  deliveryMethods?: string[];
  verifiedDocuments?: boolean;
  officialDistributor?: boolean;
};

function deliveryLabel(methods: string[] = []) {
  if (methods.includes("CARRIER")) return "Курьерская доставка";
  if (methods.includes("NATIONWIDE")) return "Доставка по Казахстану";
  if (methods.includes("PICKUP")) return "Самовывоз";
  return "Условия уточняются";
}

export default function ProductOfferActions({ offers }: { offers: Offer[] }) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { tone: "success" | "danger"; message: string } | null
  >(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
  const availableOffers = useMemo(
    () => offers.filter((offer) => offer.available && offer.priceMinor != null),
    [offers],
  );

  const addToCart = async (offer: Offer) => {
    const session = parseSessionHandoff(
      window.sessionStorage.getItem("dentmarket:buyer-session"),
      "BUYER",
    );
    if (!session) {
      window.location.assign(loginUrl);
      return;
    }
    const context: ApiContext = session.accessToken
      ? { accessToken: session.accessToken }
      : session.actorId && session.organizationId
        ? {
            actorId: session.actorId,
            organizationId: session.organizationId,
          }
        : {};
    const api = new MarketplaceApiClient(apiUrl, context);
    setBusy(offer.id);
    setFeedback(null);
    try {
      const carts = await api.get<Cart[]>(
        `/buyers/${session.organizationId}/carts`,
      );
      const cart =
        carts.find((item) => item.status === "ACTIVE") ??
        (await api.post<Cart>(`/buyers/${session.organizationId}/carts`, {
          currency: offer.currency,
        }));
      await api.post(`/carts/${cart.id}/items`, {
        offerId: offer.id,
        quantity: 1,
      });
      setFeedback({
        tone: "success",
        message: `${offer.supplier.name}: позиция добавлена в корзину.`,
      });
    } catch (cause) {
      setFeedback({ tone: "danger", message: errorMessage(cause) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <DmButton
        appearance="primary"
        icon={<Cart24Regular />}
        onClick={(event) => {
          triggerRef.current = event.currentTarget;
          setCompareOpen(true);
        }}
        disabled={!offers.length}
      >
        Сравнить и заказать
      </DmButton>
      <DmDialog
        open={compareOpen}
        onOpenChange={(open) => {
          setCompareOpen(open);
          if (!open) {
            window.requestAnimationFrame(() => triggerRef.current?.focus());
          }
        }}
        title="Предложения поставщиков"
        description="Сравните фасовку, доступность и цену. Перед checkout корзина будет проверена повторно."
      >
        {feedback ? (
          <div
            className={
              feedback.tone === "success"
                ? styles.actionSuccess
                : styles.actionError
            }
            role={feedback.tone === "danger" ? "alert" : "status"}
          >
            {feedback.message}
          </div>
        ) : null}
        <div className={styles.compareList}>
          {offers.length ? (
            offers.map((offer, index) => (
              <article
                className={styles.compareOffer}
                key={`${offer.id}-${offer.supplier.name}-${index}`}
              >
                  <div className={styles.compareOfferMain}>
                    <strong>{offer.supplier.name}</strong>
                    <span>{offer.packaging?.name ? `Фасовка: ${offer.packaging.name}` : "Фасовка уточняется"}</span>
                    <span>{deliveryLabel(offer.deliveryMethods)}</span>
                  </div>
                  <div className={styles.compareOfferSide}>
                    <strong>{formatMoney(offer.priceMinor, offer.currency)}</strong>
                    <StatusTag tone={offer.available ? "success" : "warning"}>
                      {offer.available ? "В наличии" : "Под заказ"}
                    </StatusTag>
                    {offer.verifiedDocuments ? <small>Документы проверены</small> : null}
                    <DmButton
                      appearance="primary"
                      size="small"
                      onClick={() => void addToCart(offer)}
                      disabled={busy !== null || !availableOffers.includes(offer)}
                    >
                      {busy === offer.id ? "Добавляем…" : "В корзину"}
                    </DmButton>
                  </div>
                </article>
            ))
          ) : (
            <p className={styles.muted}>Предложения ещё не добавлены.</p>
          )}
        </div>
      </DmDialog>
    </>
  );
}
