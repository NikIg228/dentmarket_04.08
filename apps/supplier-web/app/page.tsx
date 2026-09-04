"use client";

import { Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from "@fluentui/react-components";
import { ArrowSync24Regular } from "@fluentui/react-icons/svg/arrow-sync";
import { Box24Regular } from "@fluentui/react-icons/svg/box";
import { BuildingShop24Regular } from "@fluentui/react-icons/svg/building-shop";
import { ClipboardTaskListLtr24Regular } from "@fluentui/react-icons/svg/clipboard-task-list-ltr";
import { DataTrending24Regular } from "@fluentui/react-icons/svg/data-trending";
import { Document24Regular } from "@fluentui/react-icons/svg/document";
import { Money24Regular } from "@fluentui/react-icons/svg/money";
import { MoreHorizontal24Regular } from "@fluentui/react-icons/svg/more-horizontal";
import { PlugConnected24Regular } from "@fluentui/react-icons/svg/plug-connected";
import { ShieldCheckmark24Regular } from "@fluentui/react-icons/svg/shield-checkmark";
import { Star24Regular } from "@fluentui/react-icons/svg/star";
import {
  MarketplaceApiClient,
  parseSessionHandoff,
  type ApiContext,
  type SessionHandoffEnvelope,
} from "@marketplace/api-client";
import {
  AppShell,
  DmButton,
  DmFeedback,
  DmSelect,
  ErrorState,
  LoadingState,
  errorMessage,
  type NavigationItem,
} from "@marketplace/ui";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SupplierDashboard } from "./features/supplier-workspace/supplier-dashboard";
import type {
  Balance,
  ComplianceCheck,
  Credential,
  DataOverride,
  DocumentRecord,
  ExternalCatalogItem,
  FreshnessPolicy,
  ImportBatch,
  Integration,
  MerchantAccount,
  Offer,
  SupplierDataSource,
  SupplierOrder,
  SupplierSummary,
} from "./features/supplier-workspace/types";
import type { OrderConfirmationDecision } from "./order-confirmation-panel";
import { OnboardingProgress } from "./onboarding-progress";
import styles from "./page.module.css";
import { loadSupplierSectionData } from "./supplier-section-data";

const SupplierCompliance = dynamic(() =>
  import("./features/supplier-workspace/supplier-compliance").then(
    (module) => module.SupplierCompliance,
  ),
);
const SupplierDocuments = dynamic(() =>
  import("./features/supplier-workspace/supplier-documents").then(
    (module) => module.SupplierDocuments,
  ),
);
const SupplierIntegrations = dynamic(() =>
  import("./features/supplier-workspace/supplier-integrations").then(
    (module) => module.SupplierIntegrations,
  ),
);
const SupplierInventory = dynamic(() =>
  import("./features/supplier-workspace/supplier-inventory").then(
    (module) => module.SupplierInventory,
  ),
);
const SupplierOffers = dynamic(() =>
  import("./features/supplier-workspace/supplier-offers").then(
    (module) => module.SupplierOffers,
  ),
);
const SupplierOrders = dynamic(() =>
  import("./features/supplier-workspace/supplier-orders").then(
    (module) => module.SupplierOrders,
  ),
);
const PromotionsPanel = dynamic(() =>
  import("./promotions-panel").then((module) => module.PromotionsPanel),
);
const SupplierTrustPanel = dynamic(() =>
  import("./supplier-trust-panel").then((module) => module.SupplierTrustPanel),
);

const OPERATOR_ID = "00000000-0000-4000-8000-000000000002";
const OPERATOR_ORG_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_KEY = "dentmarket:supplier-session";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

type SessionHandoff = SessionHandoffEnvelope;

function readSessionHandoff(): SessionHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const serialized = window.location.hash.startsWith("#session=")
      ? decodeURIComponent(window.location.hash.slice("#session=".length))
      : window.sessionStorage.getItem(SESSION_KEY);
    if (!serialized) return null;
    return parseSessionHandoff(serialized, "SUPPLIER");
  } catch {
    return null;
  }
}

const suppliers: SupplierSummary[] = [
  { id: "00000000-0000-4000-8000-000000000020", name: "Demo Dental Supply", city: "Алматы" },
  { id: "00000000-0000-4000-8000-000000000025", name: "Ortho Trade KZ", city: "Астана" },
  { id: "00000000-0000-4000-8000-000000000060", name: "MedConsum", city: "Шымкент" },
  { id: "00000000-0000-4000-8000-000000000070", name: "TechDent Systems", city: "Алматы" },
  { id: "00000000-0000-4000-8000-000000000080", name: "SterileLine", city: "Караганда" },
];

const navigation: NavigationItem[] = [
  { id: "dashboard", label: "Обзор", icon: <DataTrending24Regular /> },
  { id: "orders", label: "Заказы", icon: <ClipboardTaskListLtr24Regular /> },
  { id: "offers", label: "Предложения", icon: <BuildingShop24Regular /> },
  { id: "inventory", label: "Остатки", icon: <Box24Regular /> },
  { id: "integrations", label: "Загрузка товаров", icon: <PlugConnected24Regular /> },
  { id: "documents", label: "Документы", icon: <Document24Regular /> },
];

export default function SupplierWorkspace() {
  const [handoff, setHandoff] = useState<SessionHandoff | null>(null);
  const [handoffChecked, setHandoffChecked] = useState(false);
  const apiContext = useMemo<ApiContext>(
    () =>
      handoff?.accessToken
        ? { accessToken: handoff.accessToken }
        : handoff?.actorId && handoff.organizationId
          ? { actorId: handoff.actorId, organizationId: handoff.organizationId }
          : { actorId: OPERATOR_ID, organizationId: OPERATOR_ORG_ID },
    [handoff],
  );
  const api = useMemo(() => new MarketplaceApiClient(API_URL, apiContext), [apiContext]);
  const [supplierId, setSupplierId] = useState(suppliers[0].id);
  const [active, setActive] = useState("dashboard");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [merchantAccounts, setMerchantAccounts] = useState<MerchantAccount[]>([]);
  const [policies, setPolicies] = useState<FreshnessPolicy[]>([]);
  const [overrides, setOverrides] = useState<DataOverride[]>([]);
  const [dataSources, setDataSources] = useState<SupplierDataSource[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [externalItems, setExternalItems] = useState<ExternalCatalogItem[]>([]);
  const [priceListFile, setPriceListFile] = useState<File | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [credentialType, setCredentialType] = useState("REGISTRATION_CERTIFICATE");
  const [credentialNumber, setCredentialNumber] = useState("");
  const [credentialFile, setCredentialFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const next = readSessionHandoff();
      if (!next?.organizationId) {
        setHandoffChecked(true);
        return;
      }
      let resolved = next;
      if (next.handoffCode && !next.accessToken) {
        const response = await fetch(`${API_URL}/auth/handoff/exchange`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handoffCode: next.handoffCode }),
        });
        if (!response.ok) {
          setHandoffChecked(true);
          return;
        }
        const session = (await response.json()) as {
          accessToken?: string;
          user?: { id: string; displayName: string };
          organizationId?: string;
          capability?: string;
        };
        resolved = { ...next, ...session, actorId: session.user?.id };
      }
      setHandoff(resolved);
      setSupplierId(resolved.organizationId!);
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(resolved));
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setHandoffChecked(true);
    })();
  }, []);

  const availableSuppliers = useMemo<SupplierSummary[]>(
    () =>
      handoff?.organizationId
        ? [
            {
              id: handoff.organizationId,
              name: handoff.organizationDisplayName || "Новая организация",
              city: "География не настроена",
            },
          ]
        : suppliers,
    [handoff],
  );
  const supplier =
    availableSuppliers.find((item) => item.id === supplierId) ??
    availableSuppliers[0];
  const supplierOrders = orders.filter(
    (order) => order.supplierOrganizationId === supplierId,
  );
  const supplierChecks = checks.filter(
    (check) => check.sellerOrganizationId === supplierId,
  );

  const refresh = useCallback(
    async (silent = false) => {
      if (!handoffChecked) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await loadSupplierSectionData(api, supplierId, active);
        if (data.offers !== undefined) {
          setOffers(data.offers);
          setPriceDrafts(
            Object.fromEntries(
              data.offers.map((offer) => [
                offer.id,
                String(
                  Number(
                    offer.prices.find((price) => price.status === "ACTIVE")
                      ?.amountMinor ?? 0,
                  ) / 100,
                ),
              ]),
            ),
          );
        }
        if (data.balances !== undefined) {
          setBalances(data.balances);
          setQuantityDrafts(
            Object.fromEntries(
              data.balances.map((balance) => [
                balance.id,
                balance.quantityOnHand,
              ]),
            ),
          );
        }
        if (data.orders !== undefined) setOrders(data.orders);
        if (data.integrations !== undefined) setIntegrations(data.integrations);
        if (data.credentials !== undefined) setCredentials(data.credentials);
        if (data.checks !== undefined) setChecks(data.checks);
        if (data.documents !== undefined) setDocuments(data.documents);
        if (data.merchantAccounts !== undefined) {
          setMerchantAccounts(data.merchantAccounts);
        }
        if (data.policies !== undefined) setPolicies(data.policies);
        if (data.overrides !== undefined) setOverrides(data.overrides);
        if (data.dataSources !== undefined) setDataSources(data.dataSources);
        if (data.importBatches !== undefined) setImportBatches(data.importBatches);
        if (data.externalItems !== undefined) setExternalItems(data.externalItems);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [active, api, handoffChecked, supplierId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const savePrice = async (offer: Offer) => {
    const amount = Number(priceDrafts[offer.id]);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Введите корректную цену");
      return;
    }
    setBusy(`price:${offer.id}`);
    setError(null);
    try {
      await api.put(`/suppliers/${supplierId}/offers/${offer.id}/price`, {
        amountMinor: Math.round(amount * 100),
        currency: "KZT",
        includesVat: true,
        source: "MANUAL",
        reason: "Обновление в кабинете поставщика",
      });
      await refresh(true);
      setToast("Цена обновлена и записана в историю");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const saveBalance = async (balance: Balance) => {
    const quantity = Number(quantityDrafts[balance.id]);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError("Введите корректный остаток");
      return;
    }
    setBusy(`balance:${balance.id}`);
    setError(null);
    try {
      await api.put(`/suppliers/${supplierId}/inventory/balances`, {
        warehouseId: balance.warehouseId,
        productVariantId: balance.productVariantId,
        offerId: balance.offerId,
        quantityOnHand: quantity,
        quantityReserved: Number(balance.quantityReserved),
        safetyStock: Number(balance.safetyStock),
        source: "MANUAL",
      });
      await refresh(true);
      setToast("Остаток обновлён, срок актуальности пересчитан");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const recomputeFreshness = async () => {
    setBusy("freshness");
    setError(null);
    try {
      await api.post(`/suppliers/${supplierId}/inventory/freshness/recompute`, {
        staleAfterMinutes: 1440,
      });
      await refresh(true);
      setToast("Актуальность складских данных пересчитана");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const confirmOrder = async (
    order: SupplierOrder,
    decisions: OrderConfirmationDecision[],
  ): Promise<string | null> => {
    setBusy(`order:${order.id}`);
    try {
      const confirmed = await api.confirmSupplierOrder(order.id, { decisions });
      await refresh(true);
      setToast(
        confirmed.status === "PARTIALLY_CONFIRMED"
          ? "Заказ подтверждён частично, итог и резерв пересчитаны"
          : "Заказ подтверждён полностью",
      );
      return null;
    } catch (cause) {
      return errorMessage(cause);
    } finally {
      setBusy(null);
    }
  };

  const submitCredential = async () => {
    if (!credentialNumber.trim()) {
      setError("Укажите номер документа");
      return;
    }
    if (!credentialFile) {
      setError("Прикрепите файл документа");
      return;
    }
    setBusy("credential");
    setError(null);
    try {
      const contentBase64 = await readFileAsBase64(
        credentialFile,
        "Не удалось прочитать файл",
      );
      await api.post(`/compliance/organizations/${supplierId}/credentials`, {
        type: credentialType,
        number: credentialNumber.trim(),
        issuer: "Поставщик",
        fileName: credentialFile.name,
        contentBase64,
        metadata: { source: "supplier-web" },
      });
      setCredentialNumber("");
      setCredentialFile(null);
      await refresh(true);
      setToast("Документ отправлен на проверку");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const downloadDocument = async (document: DocumentRecord) => {
    setBusy(`document:${document.id}`);
    setError(null);
    try {
      const result = await api.download(`/documents/${document.id}/download`);
      const url = URL.createObjectURL(result.blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download =
        result.fileName ?? `${document.title}.${document.format.toLowerCase()}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const uploadPriceList = async () => {
    if (!priceListFile) {
      setError("Выберите PDF-прайс или каталог");
      return;
    }
    if (!priceListFile.name.toLowerCase().endsWith(".pdf")) {
      setError("На этом экране принимаются PDF-файлы");
      return;
    }
    if (priceListFile.size > 20_000_000) {
      setError("PDF должен быть не больше 20 МБ");
      return;
    }
    setBusy("pdf-import");
    setError(null);
    try {
      let source = dataSources.find((item) => item.type === "PDF");
      if (!source) {
        source = await api.post<SupplierDataSource>(
          `/suppliers/${supplierId}/data-sources`,
          {
            name: "PDF-прайсы поставщика",
            type: "PDF",
            configuration: {
              extractionMode: "text-table-with-review",
              createdFrom: "supplier-web",
            },
          },
        );
      }
      const contentBase64 = await readFileAsBase64(
        priceListFile,
        "Не удалось прочитать PDF",
      );
      const batch = await api.post<ImportBatch>(
        `/suppliers/${supplierId}/import-batches`,
        {
          sourceId: source.id,
          fileName: priceListFile.name,
          fileType: "PDF",
          contentBase64,
          columnMapping: {
            externalId: "externalId",
            name: "name",
            supplierSku: "supplierSku",
            unit: "unit",
            priceMinor: "priceMinor",
            currency: "currency",
          },
        },
      );
      setPriceListFile(null);
      await refresh(true);
      setToast(
        batch.status === "REVIEW_REQUIRED"
          ? "PDF сохранён: требуется распознавание или ручная проверка"
          : `Извлечено ${batch.totalRows} строк. Проверьте данные перед обработкой`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const processImportBatch = async (batch: ImportBatch) => {
    setBusy(`import:${batch.id}`);
    setError(null);
    try {
      await api.post(
        `/suppliers/${supplierId}/import-batches/${batch.id}/process`,
        {},
      );
      await refresh(true);
      setToast("Прайс нормализован и отправлен в очередь сопоставления");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const confirmCatalogMatch = async (
    item: ExternalCatalogItem,
    productVariantId: string,
  ) => {
    setBusy(`match:${item.id}`);
    setError(null);
    try {
      await api.post(
        `/suppliers/${supplierId}/external-items/${item.id}/match`,
        { productVariantId },
      );
      await refresh(true);
      setToast("Позиция привязана к существующей карточке. Дубль не создан");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const content =
    active === "dashboard" ? (
      <SupplierDashboard
        supplier={supplier}
        offers={offers}
        balances={balances}
        orders={supplierOrders}
        integrations={integrations}
        credentials={credentials}
        checks={supplierChecks}
        policies={policies}
        onNavigate={setActive}
      />
    ) : active === "offers" ? (
      <SupplierOffers
        api={api}
        supplierId={supplierId}
        offers={offers}
        priceDrafts={priceDrafts}
        busy={busy}
        onPriceChange={(offerId, value) =>
          setPriceDrafts((items) => ({ ...items, [offerId]: value }))
        }
        onSavePrice={savePrice}
      />
    ) : active === "inventory" ? (
      <SupplierInventory
        balances={balances}
        overrides={overrides}
        quantityDrafts={quantityDrafts}
        busy={busy}
        onQuantityChange={(balanceId, value) =>
          setQuantityDrafts((items) => ({ ...items, [balanceId]: value }))
        }
        onSaveBalance={saveBalance}
        onRecompute={recomputeFreshness}
      />
    ) : active === "orders" ? (
      <SupplierOrders
        orders={supplierOrders}
        api={api}
        onConfirm={confirmOrder}
        onChanged={() => refresh(true)}
      />
    ) : active === "integrations" ? (
      <SupplierIntegrations
        authenticated={Boolean(handoff)}
        supplierId={supplierId}
        apiContext={apiContext}
        integrations={integrations}
        importBatches={importBatches}
        externalItems={externalItems}
        selectedFile={priceListFile}
        busy={busy}
        onFileChange={setPriceListFile}
        onUpload={uploadPriceList}
        onProcessBatch={processImportBatch}
        onConfirmMatch={confirmCatalogMatch}
      />
    ) : active === "compliance" ? (
      <SupplierCompliance
        credentials={credentials}
        checks={supplierChecks}
        credentialType={credentialType}
        credentialNumber={credentialNumber}
        credentialFile={credentialFile}
        busy={busy}
        onTypeChange={setCredentialType}
        onNumberChange={setCredentialNumber}
        onFileChange={setCredentialFile}
        onSubmit={submitCredential}
      />
    ) : active === "promotions" ? (
      <PromotionsPanel supplierId={supplierId} apiContext={apiContext} />
    ) : active === "trust" ? (
      <SupplierTrustPanel supplierId={supplierId} apiContext={apiContext} />
    ) : (
      <SupplierDocuments
        documents={documents}
        merchantAccounts={merchantAccounts}
        busy={busy}
        onDownload={downloadDocument}
      />
    );

  const pendingOrderCount = supplierOrders.filter(
    (order) => order.status === "AWAITING_CONFIRMATION",
  ).length;
  const nav = navigation.map((item) =>
    item.id === "orders" && pendingOrderCount
      ? { ...item, badge: String(pendingOrderCount) }
      : item,
  );

  return (
    <AppShell
      productName="DentMarket"
      productMark="DM"
      workspaceLabel="Кабинет поставщика"
      userName={supplier.name}
      userMeta={`${supplier.city} · Поставщик`}
      navigation={nav}
      activeNavigation={active}
      contextLabel={
        active === "compliance"
          ? "Комплаенс"
          : active === "promotions"
            ? "Акции"
            : active === "trust"
              ? "Доверие и география"
              : undefined
      }
      onNavigate={setActive}
      actions={
        <>
          <DmSelect
            className={styles.switcher}
            value={supplierId}
            onChange={(_, data) => setSupplierId(data.value)}
            aria-label="Организация поставщика"
          >
            {availableSuppliers.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </DmSelect>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <DmButton appearance="subtle" icon={<MoreHorizontal24Regular />}>Ещё</DmButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<ShieldCheckmark24Regular />} onClick={() => setActive("compliance")}>Комплаенс</MenuItem>
                <MenuItem icon={<Money24Regular />} onClick={() => setActive("promotions")}>Акции</MenuItem>
                <MenuItem icon={<Star24Regular />} onClick={() => setActive("trust")}>Доверие и география</MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
          <DmButton
            className={styles.refreshButton}
            appearance="subtle"
            icon={<ArrowSync24Regular />}
            disabled={loading}
            onClick={() => void refresh()}
            aria-label="Обновить данные"
          />
        </>
      }
    >
      {loading ? (
        <LoadingState label="Загружаем кабинет поставщика" />
      ) : error && !offers.length && !balances.length ? (
        <ErrorState
          description={error}
          action={<DmButton onClick={() => void refresh()}>Повторить</DmButton>}
        />
      ) : (
        <>
          {error ? (
            <DmFeedback
              tone="danger"
              title="Действие не выполнено"
              description={error}
              alert
              action={<DmButton appearance="secondary" onClick={() => setError(null)}>Закрыть</DmButton>}
            />
          ) : null}
          {handoff ? (
            <OnboardingProgress
              apiContext={apiContext}
              supplierId={supplierId}
              onNavigate={setActive}
            />
          ) : null}
          {content}
        </>
      )}
      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">{toast}</div>
      ) : null}
    </AppShell>
  );
}

function readFileAsBase64(file: File, errorText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error(errorText));
    reader.readAsDataURL(file);
  });
}
