import { Box24Regular } from "@fluentui/react-icons/svg/box";
import { BuildingShop24Regular } from "@fluentui/react-icons/svg/building-shop";
import { ClipboardTaskListLtr24Regular } from "@fluentui/react-icons/svg/clipboard-task-list-ltr";
import { Money24Regular } from "@fluentui/react-icons/svg/money";
import {
  DmButton,
  EmptyState,
  Metric,
  PageHeader,
  Section,
  StatusTag,
  formatDate,
  formatMoney,
  formatStatus,
} from "@marketplace/ui";
import styles from "../../page.module.css";
import type {
  Balance,
  ComplianceCheck,
  Credential,
  FreshnessPolicy,
  Integration,
  Offer,
  SupplierOrder,
  SupplierSummary,
} from "./types";
import { statusTone, supplierDashboardSummary } from "./view-model";

export function SupplierDashboard({
  supplier,
  offers,
  balances,
  orders,
  integrations,
  credentials,
  checks,
  policies,
  onNavigate,
}: {
  supplier: SupplierSummary;
  offers: Offer[];
  balances: Balance[];
  orders: SupplierOrder[];
  integrations: Integration[];
  credentials: Credential[];
  checks: ComplianceCheck[];
  policies: FreshnessPolicy[];
  onNavigate: (section: string) => void;
}) {
  const summary = supplierDashboardSummary({
    offers,
    balances,
    orders,
    integrations,
    credentials,
  });
  const blockedCheckCount = checks.filter(
    (item) => item.decision === "BLOCKED",
  ).length;

  return (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Рабочий день"
        title={`Добрый день, ${supplier.name}`}
        description="Сначала обработайте заказы и данные, которые непосредственно влияют на продажи."
      />
      <Section
        title="Требует внимания"
        description="Приоритетные действия на сегодня"
      >
        <div className={styles.attentionGrid}>
          <DmButton
            appearance="subtle"
            className={styles.attentionAction}
            onClick={() => onNavigate("orders")}
          >
            <StatusTag tone={summary.pendingOrderCount ? "warning" : "success"}>
              Заказы
            </StatusTag>
            <strong>
              {summary.pendingOrderCount
                ? `${summary.pendingOrderCount} ждут подтверждения`
                : "Все заказы обработаны"}
            </strong>
            <span>Подтвердите доступное количество и срок поставки.</span>
          </DmButton>
          <DmButton
            appearance="subtle"
            className={styles.attentionAction}
            onClick={() => onNavigate("inventory")}
          >
            <StatusTag tone={summary.staleBalanceCount ? "warning" : "success"}>
              Остатки
            </StatusTag>
            <strong>
              {summary.staleBalanceCount
                ? `${summary.staleBalanceCount} позиций устарели`
                : "Остатки актуальны"}
            </strong>
            <span>Обновите данные, чтобы предложения оставались видимыми.</span>
          </DmButton>
          <DmButton
            appearance="subtle"
            className={styles.attentionAction}
            onClick={() => onNavigate("offers")}
          >
            <StatusTag tone={summary.hiddenOfferCount ? "warning" : "success"}>
              Предложения
            </StatusTag>
            <strong>
              {summary.hiddenOfferCount
                ? `${summary.hiddenOfferCount} предложений скрыто`
                : "Предложения опубликованы"}
            </strong>
            <span>Проверьте цену, публикацию и обязательные документы.</span>
          </DmButton>
        </div>
      </Section>
      <div className="mp-metrics">
        <Metric
          label="Опубликовано"
          value={`${summary.publishedOfferCount} / ${offers.length}`}
          detail={`${summary.activePriceCount} с активной ценой`}
          icon={<BuildingShop24Regular />}
        />
        <Metric
          label="Доступный остаток"
          value={new Intl.NumberFormat("ru-KZ").format(summary.stock)}
          detail={`${balances.length} складских позиций`}
          icon={<Box24Regular />}
        />
        <Metric
          label="Заказы"
          value={orders.length}
          detail={`${summary.pendingOrderCount} ждут решения`}
          icon={<ClipboardTaskListLtr24Regular />}
        />
        <Metric
          label="Оборот заказов"
          value={formatMoney(summary.revenueMinor)}
          detail="До вычета комиссии и возвратов"
          icon={<Money24Regular />}
        />
      </div>
      <div className="mp-grid-2">
        <Section
          title="Состояние данных"
          description="Проверки, которые влияют на публикацию и продажи"
        >
          <div className={styles.healthGrid}>
            <div className={styles.healthItem}>
              <StatusTag tone={summary.staleBalanceCount ? "warning" : "success"}>
                Остатки
              </StatusTag>
              <strong>{summary.freshBalanceCount} актуальных</strong>
              <p>Политики актуальности: {policies.length}</p>
            </div>
            <div className={styles.healthItem}>
              <StatusTag tone={summary.activeIntegrationCount ? "success" : "neutral"}>
                Подключения
              </StatusTag>
              <strong>{integrations.length || "Нет подключений"}</strong>
              <p>{summary.integrationJobCount} обновлений товаров</p>
            </div>
            <div className={styles.healthItem}>
              <StatusTag tone={summary.verifiedCredentialCount ? "success" : "warning"}>
                Комплаенс
              </StatusTag>
              <strong>{summary.verifiedCredentialCount} проверено</strong>
              <p>{blockedCheckCount} блокирующих проверок</p>
            </div>
          </div>
        </Section>
        <Section title="Последние заказы" description="События по исполнению">
          {!orders.length ? (
            <EmptyState
              icon={<ClipboardTaskListLtr24Regular />}
              title="Заказов нет"
              description="Новые заказы покупателей появятся здесь."
            />
          ) : (
            <div className={styles.timeline}>
              {orders.slice(0, 5).map((order) => (
                <article className={styles.event} key={order.id}>
                  <span>{formatDate(order.createdAt, true)}</span>
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <p>
                      {order.buyer.displayName} · {order.items.length} позиций ·{" "}
                      {formatMoney(order.subtotalAmountMinor, order.currency)}
                    </p>
                  </div>
                  <StatusTag tone={statusTone(order.status)}>
                    {formatStatus(order.status)}
                  </StatusTag>
                </article>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
