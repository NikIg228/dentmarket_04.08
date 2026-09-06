"use client";

import { Alert24Regular } from "@fluentui/react-icons/svg/alert";
import { Cart24Regular } from "@fluentui/react-icons/svg/cart";
import { ClipboardTaskListLtr24Regular } from "@fluentui/react-icons/svg/clipboard-task-list-ltr";
import { Document24Regular } from "@fluentui/react-icons/svg/document";
import { Grid24Regular } from "@fluentui/react-icons/svg/grid";
import { List24Regular } from "@fluentui/react-icons/svg/list";
import {
  MarketplaceApiClient,
  parseSessionHandoff,
  type ApiContext,
  type DocumentArchiveItem,
  type DocumentArchiveQueryInput,
  type DocumentArchiveSummaryResponse,
  type SessionHandoffEnvelope,
} from "@marketplace/api-client";
import {
  AppShell,
  DocumentArchiveUpload,
  DocumentArchiveWorkspace,
  type DocumentArchiveFilters,
  type DocumentArchiveUploadInput,
  type NavigationItem,
} from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const SESSION_KEY = "dentmarket:buyer-session";
const DEMO_BUYER_ID = "00000000-0000-4000-8000-000000000030";
const DEMO_BUYER_USER_ID = "00000000-0000-4000-8000-000000000500";

const navigation: NavigationItem[] = [
  { id: "catalog", label: "Каталог", icon: <Grid24Regular /> },
  { id: "cart", label: "Корзина", icon: <Cart24Regular /> },
  { id: "orders", label: "Заказы", icon: <ClipboardTaskListLtr24Regular /> },
  { id: "documents", label: "Документы", icon: <Document24Regular /> },
  { id: "workspace", label: "Списки и бюджеты", icon: <List24Regular /> },
  { id: "notifications", label: "Уведомления", icon: <Alert24Regular /> },
];

const initialFilters: DocumentArchiveFilters = { q: "", category: "", status: "", accountingStatus: "", dateFrom: "", dateTo: "" };

function readSession() {
  if (typeof window === "undefined") return null;
  const serialized = window.location.hash.startsWith("#session=")
    ? decodeURIComponent(window.location.hash.slice("#session=".length))
    : window.sessionStorage.getItem(SESSION_KEY);
  return parseSessionHandoff(serialized, "BUYER");
}

export default function BuyerDocumentsPage() {
  const [handoff, setHandoff] = useState<SessionHandoffEnvelope | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [items, setItems] = useState<DocumentArchiveItem[]>([]);
  const [summary, setSummary] = useState<DocumentArchiveSummaryResponse | null>(null);
  const [filters, setFilters] = useState<DocumentArchiveFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<DocumentArchiveFilters>(initialFilters);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const next = readSession();
      if (!next?.organizationId) { setSessionReady(true); return; }
      let resolved = next;
      if (next.handoffCode && !next.accessToken) {
        const response = await fetch(`${API_URL}/auth/handoff/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handoffCode: next.handoffCode }) });
        if (response.ok) {
          const session = await response.json() as { accessToken?: string; user?: { id: string; displayName: string }; organizationId?: string; capability?: string };
          resolved = { ...next, ...session, actorId: session.user?.id, displayName: session.user?.displayName };
        }
      }
      setHandoff(resolved);
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(resolved));
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setSessionReady(true);
    })();
  }, []);

  const organizationId = handoff?.organizationId ?? DEMO_BUYER_ID;
  const apiContext = useMemo<ApiContext>(() => handoff?.accessToken
    ? { accessToken: handoff.accessToken }
    : { actorId: handoff?.actorId ?? DEMO_BUYER_USER_ID, organizationId }, [handoff, organizationId]);
  const api = useMemo(() => new MarketplaceApiClient(API_URL, apiContext), [apiContext]);

  const load = useCallback(async (append = false) => {
    setLoading(true);
    setError(null);
    try {
      const query: DocumentArchiveQueryInput = {
        q: appliedFilters.q || undefined,
        category: appliedFilters.category as DocumentArchiveQueryInput["category"] || undefined,
        status: appliedFilters.status as DocumentArchiveQueryInput["status"] || undefined,
        accountingStatus: appliedFilters.accountingStatus as DocumentArchiveQueryInput["accountingStatus"] || undefined,
        dateFrom: appliedFilters.dateFrom ? new Date(`${appliedFilters.dateFrom}T00:00:00.000Z`).toISOString() : undefined,
        dateTo: appliedFilters.dateTo ? new Date(`${appliedFilters.dateTo}T23:59:59.999Z`).toISOString() : undefined,
        cursor: append ? nextCursor ?? undefined : undefined,
        limit: 25,
      };
      const [page, nextSummary] = await Promise.all([
        api.listDocumentArchive(query),
        append && summary ? Promise.resolve(summary) : api.getDocumentArchiveSummary(),
      ]);
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
      setSummary(nextSummary);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить архив");
    } finally {
      setLoading(false);
    }
  }, [api, appliedFilters, nextCursor, summary]);

  useEffect(() => { if (sessionReady) void load(false); }, [sessionReady, api, appliedFilters]);

  const download = async (document: DocumentArchiveItem) => {
    setBusyDocumentId(document.id);
    try {
      const { blob, fileName } = await api.downloadDocument(document.id);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = fileName ?? document.fileName ?? `${document.documentNumber}.${document.format.toLowerCase()}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Не удалось скачать документ");
    } finally { setBusyDocumentId(null); }
  };

  const upload = async (input: DocumentArchiveUploadInput) => {
    setUploading(true);
    try {
      await api.uploadDocument({ ...input, ownerOrganizationId: organizationId, kind: input.kind as Parameters<typeof api.uploadDocument>[0]["kind"] });
      await load(false);
    } finally { setUploading(false); }
  };

  const updateAccounting = async (document: DocumentArchiveItem, status: "REVIEWED" | "RECONCILED" | "DISPUTED", reason: string) => {
    setBusyDocumentId(document.id);
    try {
      const updated = await api.updateDocumentAccountingStatus(document.id, { status, reason, expectedUpdatedAt: document.updatedAt });
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSummary(await api.getDocumentArchiveSummary());
    } finally { setBusyDocumentId(null); }
  };

  return <AppShell productName="DentMarket KZ" productMark="DM" workspaceLabel="Кабинет клиники" userName={handoff?.displayName ?? "Demo Dental Clinic"} userMeta={handoff?.organizationDisplayName ?? "Клиника"} navigation={navigation} activeNavigation="documents" contextLabel="Документолог" onNavigate={(id) => { if (id !== "documents") window.location.assign("/"); }} onLogout={() => { window.sessionStorage.removeItem(SESSION_KEY); window.location.assign("/login"); }}>
    <DocumentArchiveWorkspace
      roleLabel="клиника"
      organizationId={organizationId}
      items={items}
      summary={summary}
      filters={filters}
      nextCursor={nextCursor}
      loading={loading}
      error={error}
      busyDocumentId={busyDocumentId}
      uploadAction={<DocumentArchiveUpload kinds={["PAYMENT_CONFIRMATION", "CONTRACT_ADDENDUM", "ACCEPTANCE_ACT", "OTHER"]} busy={uploading} onUpload={upload} />}
      onFiltersChange={setFilters}
      onApplyFilters={() => { setAppliedFilters(filters); setNextCursor(null); }}
      onResetFilters={() => { setFilters(initialFilters); setAppliedFilters(initialFilters); setNextCursor(null); }}
      onRefresh={() => void load(false)}
      onLoadMore={() => void load(true)}
      onDownload={(document) => void download(document as DocumentArchiveItem)}
      onOpenDocument={(documentId) => api.getArchiveDocument(documentId)}
      onAccountingStatus={(document, status, reason) => updateAccounting(document as DocumentArchiveItem, status, reason)}
    />
  </AppShell>;
}
