import { MessageBar, MessageBarBody } from "@fluentui/react-components";
import { formatMoney } from "@marketplace/ui";
import styles from "./order-decision-details.module.css";

type OrderDecisionDetailsProps = {
  order: {
    subtotalAmountMinor: string;
    currency: string;
    items: Array<{
      id: string;
      quantity: string;
      acceptedQuantity: string | null;
      decisionReason: string | null;
      offer: { productVariant: { product: { canonicalName: string } } };
    }>;
  };
};

export function OrderDecisionDetails({ order }: OrderDecisionDetailsProps) {
  const changedItems = order.items.filter(
    (item) =>
      item.acceptedQuantity !== null &&
      Number(item.acceptedQuantity) < Number(item.quantity),
  );

  if (!changedItems.length) return null;

  return (
    <div className={styles.root}>
      <MessageBar intent="warning">
        <MessageBarBody>
          Поставщик изменил состав заказа. Проверьте принятые количества и
          причины до следующего шага.
        </MessageBarBody>
      </MessageBar>
      <div className={styles.summary}>
        <strong>
          Новый итог: {formatMoney(order.subtotalAmountMinor, order.currency)}
        </strong>
        <span>
          Изменено позиций: {changedItems.length} из {order.items.length}
        </span>
      </div>
      <ul className={styles.items}>
        {changedItems.map((item) => (
          <li key={item.id} className={styles.item}>
            <strong>{item.offer.productVariant.product.canonicalName}</strong>
            <span>
              Подтверждено: {item.acceptedQuantity ?? "0"} из {item.quantity}
            </span>
            <span className={styles.reason}>
              Причина: {item.decisionReason ?? "Поставщик не указал причину"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
