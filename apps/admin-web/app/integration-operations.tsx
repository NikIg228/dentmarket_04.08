"use client";

import {
  Add20Regular,
  ArrowClockwise20Regular,
  Key20Regular,
  Link20Regular,
  Play20Regular,
} from "@fluentui/react-icons";
import {
  DmButton,
  DmCheckbox,
  DmFeedback,
  DmField,
  DmInput,
  DmSelect,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatAdminStatus } from "./admin-labels";
import styles from "./integration-operations.module.css";
import { adminAuthHeaders } from "./admin-auth";
import { summarizeIntegrationHealth } from "./integration-operations-view-model";

type Supplier = {
  organizationId: string;
  organization: { displayName: string };
};
type Binding = {
  id: string;
  dataType: string;
  warehouseId?: string | null;
  offerId?: string | null;
  priority: number;
  status: string;
};
type Mapping = {
  id: string;
  entityType: string;
  externalId: string;
  internalId?: string | null;
  status: string;
};
type Agent = {
  agentId: string;
  status: string;
  version?: string | null;
  lastHeartbeatAt?: string | null;
};
type Connection = {
  id: string;
  provider: string;
  mode: string;
  status: string;
  displayName: string;
  version: number;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  bindings: Binding[];
  mappings: Mapping[];
  agent?: Agent | null;
  _count: {
    jobs: number;
    webhookEvents: number;
    reconciliationEntries: number;
    externalReservations: number;
  };
};
type Job = {
  id: string;
  type: string;
  status: string;
  trigger: string;
  attempt: number;
  maxAttempts: number;
  lastError?: string | null;
  createdAt: string;
};
type Reconciliation = {
  id: string;
  kind: string;
  status: string;
  externalRef?: string | null;
  resolution?: string | null;
  detectedAt: string;
};
type CreateResult = {
  connection: Connection;
  enrollment?: { agentId: string; enrollmentToken: string; expiresAt: string };
  webhook?: { endpointPath: string; signingSecret: string };
};
type Warehouse = { id: string; code: string; name: string };
type Offer = {
  id: string;
  productVariantId: string;
  supplierSku?: string | null;
  productVariant: { product: { canonicalName: string } };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const dataTypes = [
  "CATALOG",
  "PRICE",
  "INVENTORY",
  "ORDER",
  "RESERVATION",
  "SHIPMENT",
  "RETURN",
  "IMAGE",
];
const jobTypes = [
  "TEST_CONNECTION",
  "DISCOVER",
  "CATALOG_SYNC",
  "INCREMENTAL_SYNC",
  "PRICE_SYNC",
  "INVENTORY_SYNC",
  "RECONCILIATION",
];
const dataTypeLabels: Record<string, string> = {
  CATALOG: "Каталог",
  PRICE: "Цены",
  INVENTORY: "Остатки",
  ORDER: "Заказы",
  RESERVATION: "Резервы",
  SHIPMENT: "Отгрузки",
  RETURN: "Возвраты",
  IMAGE: "Изображения",
};

function providerLabel(provider: string) {
  return provider === "ONE_C"
    ? "1С"
    : provider === "MOYSKLAD"
      ? "МойСклад"
      : provider === "MOCK"
        ? "Тестовое подключение"
        : provider;
}
const jobTypeLabels: Record<string, string> = {
  TEST_CONNECTION: "Проверка подключения",
  DISCOVER: "Поиск доступных данных",
  CATALOG_SYNC: "Обновление каталога",
  INCREMENTAL_SYNC: "Обновление изменений",
  PRICE_SYNC: "Обновление цен",
  INVENTORY_SYNC: "Обновление остатков",
  RECONCILIATION: "Сверка данных",
};
const triggerLabels: Record<string, string> = { MANUAL: "Вручную", SCHEDULE: "По расписанию", WEBHOOK: "По уведомлению" };
function dateTime(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("ru-KZ", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "Нет данных";
}

export function IntegrationOperations() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "danger">("success");
  const [oneTimeSecret, setOneTimeSecret] = useState<{
    title: string;
    lines: string[];
  } | null>(null);
  const [provider, setProvider] = useState("MOCK");
  const [mappingType, setMappingType] = useState<"WAREHOUSE" | "VARIANT">(
    "WAREHOUSE",
  );

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        cache: "no-store",
        headers: { ...adminAuthHeaders(), ...init?.headers },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const detail = Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : payload?.message;
        throw new Error(detail ?? `Не удалось выполнить запрос (${response.status})`);
      }
      return response.json() as Promise<T>;
    },
    [],
  );

  const loadDetails = useCallback(
    async (activeSupplierId: string, activeConnectionId: string) => {
      if (!activeConnectionId) {
        setJobs([]);
        setReconciliation([]);
        return;
      }
      const [jobData, reconciliationData] = await Promise.all([
        request<Job[]>(
          `/suppliers/${activeSupplierId}/integrations/${activeConnectionId}/jobs`,
        ),
        request<Reconciliation[]>(
          `/suppliers/${activeSupplierId}/integrations/${activeConnectionId}/reconciliation?limit=30`,
        ),
      ]);
      setJobs(jobData);
      setReconciliation(reconciliationData);
    },
    [request],
  );

  const loadSupplier = useCallback(
    async (activeSupplierId: string, preferredConnectionId?: string) => {
      const [connectionData, warehouseData, offerData] = await Promise.all([
        request<Connection[]>(`/suppliers/${activeSupplierId}/integrations`),
        request<Warehouse[]>(`/suppliers/${activeSupplierId}/warehouses`),
        request<Offer[]>(`/suppliers/${activeSupplierId}/offers`),
      ]);
      const activeConnectionId =
        preferredConnectionId &&
        connectionData.some(({ id }) => id === preferredConnectionId)
          ? preferredConnectionId
          : (connectionData[0]?.id ?? "");
      setConnections(connectionData);
      setWarehouses(warehouseData);
      setOffers(offerData);
      setConnectionId(activeConnectionId);
      await loadDetails(activeSupplierId, activeConnectionId);
    },
    [loadDetails, request],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supplierData = await request<Supplier[]>("/suppliers");
      const activeSupplierId =
        supplierId || supplierData[0]?.organizationId || "";
      setSuppliers(supplierData);
      if (!supplierId && activeSupplierId) setSupplierId(activeSupplierId);
      if (activeSupplierId) await loadSupplier(activeSupplierId, connectionId);
      setMessage("");
    } catch (error) {
      setMessageTone("danger");
      setMessage(
        error instanceof Error ? error.message : "Подключения недоступны.",
      );
    } finally {
      setLoading(false);
    }
  }, [connectionId, loadSupplier, request, supplierId]);

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(
    () => connections.find(({ id }) => id === connectionId) ?? null,
    [connectionId, connections],
  );
  const counts = useMemo(
    () =>
      summarizeIntegrationHealth({
        connectionStatuses: connections.map(({ status }) => status),
        jobStatuses: jobs.map(({ status }) => status),
        reconciliationStatuses: reconciliation.map(({ status }) => status),
      }),
    [connections, jobs, reconciliation],
  );

  async function act(
    action: () => Promise<unknown>,
    success: string,
    preferredConnectionId = connectionId,
  ) {
    if (!supplierId) return;
    setWorking(true);
    setMessage("");
    try {
      await action();
      await loadSupplier(supplierId, preferredConnectionId);
      setMessageTone("success");
      setMessage(success);
    } catch (error) {
      setMessageTone("danger");
      setMessage(
        error instanceof Error ? error.message : "Операция не выполнена.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function createConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const token = String(data.get("accessToken") ?? "").trim();
    const enableWebhook = data.get("enableWebhook") === "on";
    setWorking(true);
    setMessage("");
    try {
      const result = await request<CreateResult>(
        `/suppliers/${supplierId}/integrations`,
        {
          method: "POST",
          body: JSON.stringify({
            provider,
            mode:
              provider === "ONE_C" ? "AGENT" : enableWebhook ? "HYBRID" : "API",
            displayName: data.get("displayName"),
            ...(token ? { credentials: { accessToken: token } } : {}),
            enableWebhook,
            configuration: provider === "MOCK" ? { mockCatalog: [] } : {},
          }),
        },
      );
      const lines = result.enrollment
        ? [
            `Agent ID: ${result.enrollment.agentId}`,
            `Ключ подключения: ${result.enrollment.enrollmentToken}`,
            `Действует до: ${dateTime(result.enrollment.expiresAt)}`,
          ]
        : result.webhook
          ? [
              `Адрес подключения: ${result.webhook.endpointPath}`,
              `Ключ подписи: ${result.webhook.signingSecret}`,
            ]
          : [];
      setOneTimeSecret(
        lines.length ? { title: "Сохраните данные сейчас", lines } : null,
      );
      form.reset();
      await loadSupplier(supplierId, result.connection.id);
      setMessageTone("success");
      setMessage(
        "Подключение создано. Первичная проверка поставлена в очередь.",
      );
    } catch (error) {
      setMessageTone("danger");
      setMessage(
        error instanceof Error ? error.message : "Подключение не создано.",
      );
    } finally {
      setWorking(false);
    }
  }

  function createBinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const scope = String(data.get("scope") ?? "global");
    const scoped = scope.startsWith("warehouse:")
      ? { warehouseId: scope.slice(10) }
      : scope.startsWith("offer:")
        ? { offerId: scope.slice(6) }
        : {};
    return act(
      () =>
        request(
          `/suppliers/${supplierId}/integrations/${selected.id}/bindings`,
          {
            method: "POST",
            body: JSON.stringify({
              dataType: data.get("dataType"),
              priority: Number(data.get("priority") || 100),
              ...scoped,
            }),
          },
        ),
      "Привязка данных создана.",
    );
  }

  function upsertMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const form = event.currentTarget;
    return act(async () => {
      await request(
        `/suppliers/${supplierId}/integrations/${selected.id}/mappings`,
        {
          method: "POST",
          body: JSON.stringify({
            entityType: mappingType,
            externalId: data.get("externalId"),
            internalId: data.get("internalId"),
          }),
        },
      );
      form.reset();
    }, "Соответствие сохранено.");
  }

  function enqueueJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const type = String(new FormData(event.currentTarget).get("jobType"));
    return act(
      () =>
        request(`/suppliers/${supplierId}/integrations/${selected.id}/jobs`, {
          method: "POST",
          body: JSON.stringify({
            type,
            idempotencyKey: `ui-${type.toLowerCase()}-${Date.now()}`,
          }),
        }),
      "Задание добавлено в надёжную очередь.",
    );
  }

  function changeStatus(status: "ACTIVE" | "PAUSED" | "REVOKED") {
    if (!selected) return;
    return act(
      () =>
        request(`/suppliers/${supplierId}/integrations/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ version: selected.version, status }),
        }),
      status === "PAUSED"
        ? "Подключение приостановлено."
        : status === "ACTIVE"
          ? "Подключение активно."
          : "Доступ подключения отозван.",
    );
  }

  async function rotateEnrollment() {
    if (!selected) return;
    setWorking(true);
    setMessage("");
    try {
      const result = await request<{
        agentId: string;
        enrollmentToken: string;
        expiresAt: string;
      }>(
        `/suppliers/${supplierId}/integrations/${selected.id}/agent/enrollment`,
        { method: "POST" },
      );
      setOneTimeSecret({
        title: "Новый ключ для подключения",
        lines: [
          `Agent ID: ${result.agentId}`,
          `Ключ подключения: ${result.enrollmentToken}`,
          `Действует до: ${dateTime(result.expiresAt)}`,
        ],
      });
      await loadSupplier(supplierId, selected.id);
      setMessageTone("success");
      setMessage("Токен агента перевыпущен. Старый токен недействителен.");
    } catch (error) {
      setMessageTone("danger");
      setMessage(
        error instanceof Error ? error.message : "Токен не перевыпущен.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      id="integration-operations"
      className={styles.section}
      aria-label="Загрузка товаров поставщика"
    >
      <div className={styles.heading}>
        <div>
          <h2>Подключение учётных систем</h2>
          <p>
            Подключайте МойСклад или 1С и проверяйте обновление товаров.
          </p>
        </div>
        <div className={styles.toolbar}>
          <DmField label="Поставщик">
            <DmSelect
              value={supplierId}
              onChange={(_, data) => {
                const id = data.value;
                setSupplierId(id);
                void loadSupplier(id);
              }}
              disabled={loading || working}
            >
              {suppliers.map((supplier) => (
                <option
                  key={supplier.organizationId}
                  value={supplier.organizationId}
                >
                  {supplier.organization.displayName}
                </option>
              ))}
            </DmSelect>
          </DmField>
          <DmButton
            appearance="secondary"
            icon={<ArrowClockwise20Regular />}
            onClick={() => void load()}
            disabled={loading || working}
          >
            Обновить
          </DmButton>
        </div>
      </div>

      {message ? (
        <DmFeedback
          tone={messageTone}
          title={messageTone === "danger" ? "Операция не выполнена" : "Операция выполнена"}
          description={message}
          alert={messageTone === "danger"}
        />
      ) : null}
      {oneTimeSecret && (
        <div className={styles.secret} role="alert">
          <Key20Regular />
          <div>
            <strong>{oneTimeSecret.title}</strong>
            {oneTimeSecret.lines.map((line) => (
              <code key={line}>{line}</code>
            ))}
          </div>
          <DmButton
            appearance="subtle"
            aria-label="Закрыть данные подключения"
            onClick={() => setOneTimeSecret(null)}
          >
            Закрыть
          </DmButton>
        </div>
      )}

      {loading ? (
        <LoadingState label="Загружаем подключения" />
      ) : (
        <>
          <div className={styles.metrics}>
            <div>
              <span>Активные</span>
              <strong>{counts.active}</strong>
            </div>
            <div>
              <span>В очереди</span>
              <strong>{counts.queued}</strong>
            </div>
            <div>
              <span>С ошибкой</span>
              <strong>{counts.dead}</strong>
            </div>
            <div>
              <span>Расхождения</span>
              <strong>{counts.mismatches}</strong>
            </div>
          </div>
          <div className={styles.layout}>
            <div className={styles.connectionPane}>
              <form
                className={styles.createForm}
                onSubmit={(event) => void createConnection(event)}
              >
                <header>
                  <div>
                    <h3>Новое подключение</h3>
                    <p>Данные для входа будут показаны только один раз.</p>
                  </div>
                  <Add20Regular />
                </header>
                <DmField label="Система" required>
                  <DmSelect
                    value={provider}
                    onChange={(_, data) => setProvider(data.value)}
                    disabled={working}
                  >
                    <option value="MOCK">Тестовое подключение</option>
                    <option value="MOYSKLAD">МойСклад</option>
                    <option value="ONE_C">1С</option>
                  </DmSelect>
                </DmField>
                <DmField label="Название" required>
                  <DmInput
                    name="displayName"
                    required
                    minLength={2}
                    placeholder="Основной склад"
                  />
                </DmField>
                {provider === "MOYSKLAD" && (
                  <DmField className={styles.full} label="Ключ доступа" required>
                    <DmInput
                      name="accessToken"
                      type="password"
                      required
                      autoComplete="new-password"
                    />
                  </DmField>
                )}
                <DmCheckbox
                  className={`${styles.check} ${styles.full}`}
                  name="enableWebhook"
                  label="Получать обновления автоматически"
                  disabled={working}
                />
                <DmButton
                  className={styles.full}
                  type="submit"
                  appearance="primary"
                  icon={<Link20Regular />}
                  disabled={working}
                >
                  {working ? "Подключаем…" : "Подключить"}
                </DmButton>
              </form>

              <div className={styles.connectionList}>
                <header>
                  <h3>Подключения</h3>
                  <span>{connections.length}</span>
                </header>
                {connections.length === 0 ? (
                  <div className={styles.empty}>
                    Подключений пока нет. Добавьте учётную систему.
                  </div>
                ) : (
                  connections.map((connection) => (
                    <DmButton
                      appearance="subtle"
                      key={connection.id}
                      className={
                        connection.id === connectionId
                          ? styles.connectionActive
                          : ""
                      }
                      onClick={() => {
                        setConnectionId(connection.id);
                        void loadDetails(supplierId, connection.id);
                      }}
                    >
                      <span>
                        <strong>{connection.displayName}</strong>
                        <small>
                          {providerLabel(connection.provider)} /{" "}
                          {connection.mode}
                        </small>
                      </span>
                      <StatusTag tone={connection.status === "ACTIVE" ? "success" : connection.status === "ERROR" ? "danger" : "neutral"}>
                        {formatAdminStatus(connection.status)}
                      </StatusTag>
                    </DmButton>
                  ))
                )}
              </div>
            </div>

            <div className={styles.detailPane}>
              {!selected ? (
                <div className={styles.empty}>
                  Выберите подключение для управления.
                </div>
              ) : (
                <>
                  <header className={styles.detailHeader}>
                    <div>
                      <h3>{selected.displayName}</h3>
                      <p>
                        {providerLabel(selected.provider)}. Последний успех:{" "}
                        {dateTime(selected.lastSuccessAt)}
                      </p>
                    </div>
                    <div className={styles.statusActions}>
                      {selected.status === "PAUSED" ? (
                        <DmButton
                          appearance="primary"
                          onClick={() => void changeStatus("ACTIVE")}
                          disabled={working}
                        >
                          Возобновить
                        </DmButton>
                      ) : (
                        selected.status !== "REVOKED" && (
                          <DmButton
                            appearance="secondary"
                            onClick={() => void changeStatus("PAUSED")}
                            disabled={working}
                          >
                            Пауза
                          </DmButton>
                        )
                      )}
                      {selected.status !== "REVOKED" && (
                        <DmButton
                          appearance="subtle"
                          onClick={() => void changeStatus("REVOKED")}
                          disabled={working}
                        >
                          Отозвать
                        </DmButton>
                      )}
                    </div>
                  </header>
                  {selected.lastError && (
                    <div className={styles.error}>
                      <strong>Последняя ошибка</strong>
                      <span>{selected.lastError}</span>
                    </div>
                  )}
                  {selected.agent && (
                    <div className={styles.agent}>
                      <span>
                        <strong>1С</strong>
                        <small>{selected.agent.agentId}</small>
                      </span>
                      <span>
                        <b>{formatAdminStatus(selected.agent.status)}</b>
                        <small>
                          Последняя связь: {dateTime(selected.agent.lastHeartbeatAt)}
                        </small>
                      </span>
                      <DmButton
                        icon={<Key20Regular />}
                        appearance="secondary"
                        onClick={() => void rotateEnrollment()}
                        disabled={working}
                      >
                        Новый ключ
                      </DmButton>
                    </div>
                  )}

                  <div className={styles.controls}>
                    <form onSubmit={(event) => void createBinding(event)}>
                      <h4>Выбрать данные</h4>
                      <DmField label="Тип данных">
                        <DmSelect name="dataType">
                          {dataTypes.map((type) => (
                            <option key={type} value={type}>{dataTypeLabels[type] ?? type}</option>
                          ))}
                        </DmSelect>
                      </DmField>
                      <DmField label="Область">
                        <DmSelect name="scope">
                          <option value="global">Весь поставщик</option>
                          {warehouses.map((warehouse) => (
                            <option
                              key={warehouse.id}
                              value={`warehouse:${warehouse.id}`}
                            >
                              Склад: {warehouse.name}
                            </option>
                          ))}
                          {offers.map((offer) => (
                            <option key={offer.id} value={`offer:${offer.id}`}>
                              Предложение:{" "}
                              {offer.supplierSku ??
                                offer.productVariant.product.canonicalName}
                            </option>
                          ))}
                        </DmSelect>
                      </DmField>
                      <DmField label="Приоритет">
                        <DmInput
                          name="priority"
                          type="number"
                          min="0"
                          defaultValue="100"
                        />
                      </DmField>
                      <DmButton
                        type="submit"
                        appearance="secondary"
                        disabled={working}
                      >
                        Добавить
                      </DmButton>
                    </form>
                    <form onSubmit={(event) => void enqueueJob(event)}>
                      <h4>Обновить данные</h4>
                      <DmField label="Операция">
                        <DmSelect name="jobType">
                          {jobTypes.map((type) => (
                            <option key={type} value={type}>{jobTypeLabels[type] ?? type}</option>
                          ))}
                        </DmSelect>
                      </DmField>
                      <DmButton
                        type="submit"
                        appearance="primary"
                        icon={<Play20Regular />}
                        disabled={working}
                      >
                        {working ? "Запускаем…" : "Запустить"}
                      </DmButton>
                    </form>
                    <form onSubmit={(event) => void upsertMapping(event)}>
                      <h4>Связать записи</h4>
                      <DmField label="Что связать">
                        <DmSelect
                          value={mappingType}
                          onChange={(_, data) =>
                            setMappingType(
                              data.value as "WAREHOUSE" | "VARIANT",
                            )
                          }
                        >
                          <option value="WAREHOUSE">Склад</option>
                          <option value="VARIANT">Вариант товара</option>
                        </DmSelect>
                      </DmField>
                      <DmField label="Код в учётной системе" required>
                        <DmInput
                          name="externalId"
                          required
                          placeholder={
                            mappingType === "WAREHOUSE"
                              ? "store UUID"
                              : "product UUID"
                          }
                        />
                      </DmField>
                      <DmField label="Карточка в DentMarket" required>
                        <DmSelect name="internalId" required>
                          {mappingType === "WAREHOUSE"
                            ? warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                  {warehouse.name} / {warehouse.code}
                                </option>
                              ))
                            : offers.map((offer) => (
                                <option
                                  key={offer.productVariantId}
                                  value={offer.productVariantId}
                                >
                                  {offer.productVariant.product.canonicalName} /{" "}
                                  {offer.supplierSku ?? "без SKU"}
                                </option>
                              ))}
                        </DmSelect>
                      </DmField>
                      <DmButton
                        type="submit"
                        appearance="secondary"
                        disabled={working}
                      >
                        Сохранить
                      </DmButton>
                    </form>
                  </div>

                  <section className={styles.bindings}>
                    <header>
                      <h4>Какие данные обновлять</h4>
                      <span>{selected.bindings.length}</span>
                    </header>
                    {selected.bindings.length === 0 ? (
                      <div className={styles.empty}>
                        Выберите данные, которые нужно обновлять.
                      </div>
                    ) : (
                      <div>
                        {selected.bindings.map((binding) => (
                          <span key={binding.id}>
                            <b>{dataTypeLabels[binding.dataType] ?? binding.dataType}</b>
                            <small>приоритет {binding.priority}</small>
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className={styles.bindings}>
                    <header>
                      <h4>Связанные записи</h4>
                      <span>{selected.mappings.length}</span>
                    </header>
                    {selected.mappings.length === 0 ? (
                      <div className={styles.empty}>
                        Связанных записей пока нет. Они нужны, если названия складов или товаров различаются.
                      </div>
                    ) : (
                      <div>
                        {selected.mappings.map((mapping) => (
                          <span key={mapping.id}>
                            <b>{mapping.entityType}</b>
                            <small>
                              {mapping.externalId} →{" "}
                              {mapping.internalId?.slice(0, 8) ?? "данные"}
                            </small>
                          </span>
                        ))}
                      </div>
                    )}
                  </section>

                  <div className={styles.activityGrid}>
                    <section>
                      <header>
                        <h4>Обновления</h4>
                        <span>{jobs.length}</span>
                      </header>
                      {jobs.length === 0 ? (
                        <div className={styles.empty}>Заданий нет.</div>
                      ) : (
                        <div className={styles.rows}>
                          {jobs.slice(0, 8).map((job) => (
                            <div key={job.id}>
                              <span>
                                <b>{jobTypeLabels[job.type] ?? "Обновление данных"}</b>
                                <small>
                                  {triggerLabels[job.trigger] ?? "Автоматически"}, попытка {job.attempt} из{" "}
                                  {job.maxAttempts}
                                </small>
                              </span>
                              <StatusTag tone={job.status === "SUCCEEDED" ? "success" : job.status === "FAILED" || job.status === "DEAD_LETTER" ? "danger" : "warning"}>
                                {formatAdminStatus(job.status)}
                              </StatusTag>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                    <section>
                      <header>
                        <h4>Сверка</h4>
                        <span>{reconciliation.length}</span>
                      </header>
                      {reconciliation.length === 0 ? (
                        <div className={styles.empty}>
                          Расхождений не обнаружено.
                        </div>
                      ) : (
                        <div className={styles.rows}>
                          {reconciliation.slice(0, 8).map((entry) => (
                            <div key={entry.id}>
                              <span>
                                <b>{entry.kind}</b>
                                <small>{dateTime(entry.detectedAt)}</small>
                              </span>
                              <StatusTag tone={entry.status === "MATCHED" || entry.status === "RESOLVED" ? "success" : entry.status === "MISMATCH" ? "danger" : "warning"}>
                                {formatAdminStatus(entry.status)}
                              </StatusTag>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
