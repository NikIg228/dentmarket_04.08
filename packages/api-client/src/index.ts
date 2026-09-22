import { deploymentFeatures, isDeploymentApiPathEnabled, type DeploymentProfile } from "@marketplace/schemas/deployment-policy";

// Next replaces this literal at build time. Missing/unrecognised values stay pilot.
export const frontendDeploymentProfile: DeploymentProfile =
  process.env.NEXT_PUBLIC_DEPLOYMENT_PROFILE === "go_live" ? "go_live" : "pilot";
export const frontendFeatures = deploymentFeatures(frontendDeploymentProfile);

import type {
  AcceptSupplierTermsInput, ReviewSupplierAdmissionInput, SupplierLegalBundle, SupplierTermsState, SupplierTermsAcceptance, SupplierAdmissionList,
  WorkspaceContext,
  AuthClientOptions, AuthRegistrationAccepted, AuthForgotAccepted, AuthEmailRegistration, LocalOperatorLogin, LocalOperatorSession,
  RegistrationResumeRequest,
  RegistrationResumeProof,
  RegistrationResumeComplete,
  RegistrationResumeRequested,
  RegistrationResumeDetails,
  RegistrationResumeCompleted,
  AddCartItemRequest,
  UpdateCartItemRequest,
  CartVersionRequest,
  RepriceCartRequest,
  ApproveImportProductCandidateInput,
  CartItemResponse,
  CartResponse,
  CartValidationResponse,
  CatalogSearchResponse,
  CatalogImportReview,
  CatalogImportReviewQueueResponse,
  CheckoutCartRequest,
  CheckoutResponse,
  CompareOffersRequest,
  ConfirmSupplierOrderRequest,
  CreateImportBatchInput,
  RollbackImportBatchInput,
  GenerateOrderDocumentPackRequest,
  CreateShipmentRequest,
  OrderDocumentPackResponse,
  PreparedOrderDocumentsResponse,
  CreateCartRequest,
  DocumentArchiveItem,
  DocumentArchivePageResponse,
  DocumentArchiveQueryInput,
  DocumentArchiveSummaryResponse,
  OfferComparisonResponse,
  SearchCatalogRequest,
  SupplierOrderResponse,
  SupplierImportBatchResponse,
  SupplierImportDiagnosticsResponse,
  SupplierImportRollbackResponse,
  ShipmentResponse,
  SetOfferPublicationInput,
  SupplierOfferPublicationResponse,
  TransitionShipmentRequest,
  OutboxDeadLetterQueryInput,
  OutboxDeadLetterListResponse,
  OutboxReplayInput,
  OutboxReplayResponse,
  UpdateDocumentAccountingStatusInput,
  UploadDocumentInput,
} from "@marketplace/schemas";

export type {
  CatalogSearchResponse,
  CatalogImportReview,
  CatalogImportReviewQueueResponse,
  OrderDocumentResponse,
  SupplierOfferPublicationResponse,
  SupplierImportBatchResponse,
  SupplierImportDiagnosticsResponse,
  SupplierImportRollbackResponse,
  DocumentArchiveItem,
  DocumentArchivePageResponse,
  DocumentArchiveQueryInput,
  DocumentArchiveSummaryResponse,
  UpdateDocumentAccountingStatusInput,
  UploadDocumentInput,
} from "@marketplace/schemas";

export type ApiContext = {
  actorId?: string;
  organizationId?: string;
  accessToken?: string;
};

export type SessionHandoffEnvelope = {
  actorId?: string;
  sessionId?: string;
  displayName?: string;
  organizationDisplayName?: string;
  organizationId?: string;
  accessToken?: string;
  handoffCode?: string;
  capability?: string;
};

export function parseSessionHandoff(
  serialized: string | null,
  capability: "BUYER" | "SUPPLIER",
): SessionHandoffEnvelope | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as SessionHandoffEnvelope;
    if (
      value.capability !== capability ||
      !value.organizationId ||
      (!value.accessToken && !value.actorId && !value.handoffCode)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

/** Revoke the handoff's session, never an unrelated refresh-cookie session. */
export async function revokeWorkspaceSession(
  apiUrl: string,
  session: { sessionId?: string; accessToken?: string } | null,
): Promise<void> {
  if (!session?.sessionId || !session.accessToken) {
    throw new Error("Не удалось определить серверную сессию. Выход не подтверждён.");
  }
  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, "")}/auth/sessions/${encodeURIComponent(session.sessionId)}/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` },
      // Existing bearer endpoint: no identity headers, refresh cookies or
      // fallback to logout of a potentially different cookie-bound session.
      credentials: "omit",
      body: JSON.stringify({ reason: "user_logout" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Не удалось связаться с сервером. Выход не подтверждён — проверьте соединение и повторите.");
  }
  if (!response.ok) {
    throw new Error(response.status === 401
      ? "Сервер не подтвердил выход: доступ к сессии истёк или уже отозван. Повторите попытку; при повторной ошибке обратитесь в поддержку."
      : "Сервер не подтвердил выход. Повторите попытку.");
  }
  const result = await response.json().catch(() => null) as { id?: string; status?: string } | null;
  if (result?.id !== session.sessionId || result.status !== "REVOKED") {
    throw new Error("Сервер не подтвердил отзыв текущей сессии. Повторите попытку.");
  }
}

export class MarketplaceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(
      typeof payload === "object" && payload && "message" in payload
        ? String(payload.message)
        : `Marketplace API returned ${status}`,
    );
  }
}

export class MarketplaceApiClient {
  getSupplierLegalDocuments() { return this.get<SupplierLegalBundle>("/supplier-terms/documents"); }
  getSupplierTerms() { return this.get<SupplierTermsState>("/supplier-terms/current"); }
  acceptSupplierTerms(input: AcceptSupplierTermsInput) { return this.post<SupplierTermsAcceptance>("/supplier-terms/acceptances", input); }
  getSupplierAdmissions() { return this.get<SupplierAdmissionList>("/supplier-terms/operator/acceptances"); }
  reviewSupplierAdmission(id: string, input: ReviewSupplierAdmissionInput) { return this.post<SupplierTermsAcceptance>(`/supplier-terms/operator/acceptances/${encodeURIComponent(id)}/review`, input); }
  downloadSupplierTerms(id: string) { return this.download(`/supplier-terms/acceptances/${encodeURIComponent(id)}/download`); }
  constructor(
    private readonly baseUrl: string,
    private readonly context: ApiContext,
  ) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.context.accessToken)
      headers.authorization = `Bearer ${this.context.accessToken}`;
    else {
      if (this.context.actorId) headers["x-user-id"] = this.context.actorId;
      if (this.context.organizationId)
        headers["x-organization-id"] = this.context.organizationId;
    }
    return headers;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertEnabledPath(path);
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...this.headers(),
        ...init.headers,
      },
      cache: "no-store",
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) throw new MarketplaceApiError(response.status, payload);
    return payload as T;
  }

  async download(
    path: string,
  ): Promise<{ blob: Blob; fileName: string | null }> {
    this.assertEnabledPath(path);
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      headers: this.headers(),
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = JSON.parse(text);
      } catch {}
      throw new MarketplaceApiError(response.status, payload);
    }
    const disposition = response.headers.get("content-disposition");
    const encodedName = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    let blob: Blob;
    if ((response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      const payload = (await response.json()) as { url?: unknown };
      if (typeof payload.url !== "string" || !payload.url) throw new MarketplaceApiError(502, { message: "Document download did not return a file or signed URL" });
      const signedResponse = await fetch(payload.url, { cache: "no-store" });
      if (!signedResponse.ok) throw new MarketplaceApiError(signedResponse.status, { message: "Signed document download failed" });
      blob = await signedResponse.blob();
    } else {
      blob = await response.blob();
    }
    return {
      blob,
      fileName: encodedName ? decodeURIComponent(encodedName) : null,
    };
  }

  private assertEnabledPath(path: string) {
    if (!isDeploymentApiPathEnabled(frontendDeploymentProfile, `${this.baseUrl.replace(/\/$/, "")}${path}`)) {
      throw new MarketplaceApiError(404, { code: "FEATURE_UNAVAILABLE", message: "Функция недоступна в текущем профиле", path });
    }
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }
  requestRegistrationResume(input: RegistrationResumeRequest) {
    return this.post<RegistrationResumeRequested>("/auth/registration/resume/request", input);
  }
  authClientOptions() { return this.get<AuthClientOptions>("/auth/client-options"); }
  workspaceContext() { return this.get<WorkspaceContext>("/auth/workspace-context"); }
  registerEmail(input: AuthEmailRegistration) { return this.post<AuthRegistrationAccepted>("/auth/register", input); }
  requestPasswordReset(email: string) { return this.post<AuthForgotAccepted>("/auth/password/forgot", { email }); }
  loginLocalOperator(input: LocalOperatorLogin) { return this.post<LocalOperatorSession>("/auth/local-operator/login", input); }
  inspectRegistrationResume(input: RegistrationResumeProof) {
    return this.post<RegistrationResumeDetails>("/auth/registration/resume/inspect", input);
  }
  completeRegistrationResume(input: RegistrationResumeComplete) {
    return this.post<RegistrationResumeCompleted>("/auth/registration/resume/complete", input);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  put<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: "PUT", body: JSON.stringify(body) });
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  private withQuery(path: string, input: Record<string, unknown>) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null || value === "") continue;
      query.set(key, String(value));
    }
    const serialized = query.toString();
    return serialized ? `${path}?${serialized}` : path;
  }

  searchCatalog(input: SearchCatalogRequest) {
    return this.get<CatalogSearchResponse>(
      this.withQuery("/marketplace/search", input),
    );
  }

  searchPublicCatalog(
    input: Omit<SearchCatalogRequest, "buyerOrganizationId">,
  ) {
    return this.get<CatalogSearchResponse>(
      this.withQuery("/catalog/search", input),
    );
  }

  compareOffers(input: CompareOffersRequest) {
    const { productId, ...query } = input;
    return this.get<OfferComparisonResponse>(
      this.withQuery(`/marketplace/products/${productId}/compare`, query),
    );
  }

  comparePublicOffers(
    productId: string,
    input: Omit<CompareOffersRequest, "buyerOrganizationId" | "productId">,
  ) {
    return this.get<OfferComparisonResponse>(
      this.withQuery(`/catalog/products/${productId}/compare`, input),
    );
  }

  listCarts(buyerOrganizationId: string) {
    return this.get<CartResponse[]>(`/buyers/${buyerOrganizationId}/carts`);
  }

  createCart(buyerOrganizationId: string, input: CreateCartRequest) {
    return this.post<CartResponse>(
      `/buyers/${buyerOrganizationId}/carts`,
      input,
    );
  }

  addCartItem(cartId: string, input: AddCartItemRequest) {
    return this.post<CartItemResponse>(`/carts/${cartId}/items`, input);
  }

  updateCartItem(cartId: string, itemId: string, input: UpdateCartItemRequest) {
    return this.patch<CartResponse>(`/carts/${cartId}/items/${itemId}`, input);
  }

  removeCartItem(cartId: string, itemId: string, input: CartVersionRequest) {
    return this.request<CartResponse>(`/carts/${cartId}/items/${itemId}`, { method: "DELETE", body: JSON.stringify(input) });
  }

  repriceCart(cartId: string, input: RepriceCartRequest = {}) {
    return this.post<CartResponse>(`/carts/${cartId}/reprice`, input);
  }

  validateCart(cartId: string) {
    return this.post<CartValidationResponse>(`/carts/${cartId}/validate`);
  }

  checkoutCart(cartId: string, input: CheckoutCartRequest) {
    return this.post<CheckoutResponse>(`/carts/${cartId}/checkout`, input);
  }

  getCheckout(checkoutId: string) {
    return this.get<CheckoutResponse>(`/checkouts/${checkoutId}`);
  }

  listBuyerOrders(buyerOrganizationId: string) {
    return this.get<SupplierOrderResponse[]>(
      `/buyers/${buyerOrganizationId}/orders`,
    );
  }

  listSupplierOrders(checkoutId?: string) {
    return this.get<SupplierOrderResponse[]>(
      this.withQuery("/supplier-orders", { checkoutId }),
    );
  }

  confirmSupplierOrder(orderId: string, input: ConfirmSupplierOrderRequest) {
    return this.post<SupplierOrderResponse>(
      `/supplier-orders/${orderId}/confirm`,
      input,
    );
  }

  listOrderShipments(orderId: string) {
    return this.get<ShipmentResponse[]>(
      `/supplier-orders/${orderId}/shipments`,
    );
  }

  createShipment(orderId: string, input: CreateShipmentRequest) {
    return this.post<ShipmentResponse>(
      `/supplier-orders/${orderId}/shipments`,
      input,
    );
  }

  transitionShipment(shipmentId: string, input: TransitionShipmentRequest) {
    return this.post<ShipmentResponse>(
      `/shipments/${shipmentId}/transitions`,
      input,
    );
  }

  generateOrderDocumentPack(
    orderId: string,
    input: GenerateOrderDocumentPackRequest,
  ) {
    return this.post<OrderDocumentPackResponse>(
      `/supplier-orders/${orderId}/document-pack`,
      input,
    );
  }

  prepareOrderDocuments(orderId: string) {
    return this.post<PreparedOrderDocumentsResponse>(
      `/supplier-orders/${orderId}/documents/prepare`,
      {},
    );
  }

  listDocumentArchive(input: DocumentArchiveQueryInput = {}) {
    return this.get<DocumentArchivePageResponse>(
      this.withQuery("/documents/archive", input),
    );
  }

  getDocumentArchiveSummary() {
    return this.get<DocumentArchiveSummaryResponse>("/documents/archive/summary");
  }

  getArchiveDocument(documentId: string) {
    return this.get<DocumentArchiveItem>(`/documents/archive/${documentId}`);
  }

  updateDocumentAccountingStatus(documentId: string, input: UpdateDocumentAccountingStatusInput) {
    return this.patch<DocumentArchiveItem>(`/documents/archive/${documentId}/accounting-status`, input);
  }

  uploadDocument(input: UploadDocumentInput) {
    return this.post<DocumentArchiveItem>("/documents/upload", input);
  }

  downloadDocument(documentId: string) {
    return this.download(`/documents/${documentId}/download`);
  }

  createSupplierImportBatch(
    supplierOrganizationId: string,
    input: CreateImportBatchInput,
  ) {
    return this.post<SupplierImportBatchResponse>(
      `/suppliers/${supplierOrganizationId}/import-batches`,
      input,
    );
  }

  processSupplierImportBatch(supplierOrganizationId: string, batchId: string) {
    return this.post<SupplierImportBatchResponse>(
      `/suppliers/${supplierOrganizationId}/import-batches/${batchId}/process`,
      {},
    );
  }

  getSupplierImportDiagnostics(
    supplierOrganizationId: string,
    batchId: string,
  ) {
    return this.get<SupplierImportDiagnosticsResponse>(
      `/suppliers/${supplierOrganizationId}/import-batches/${batchId}/diagnostics`,
    );
  }

  rollbackSupplierImportBatch(
    supplierOrganizationId: string,
    batchId: string,
    input: RollbackImportBatchInput,
  ) {
    return this.post<SupplierImportRollbackResponse>(
      `/suppliers/${supplierOrganizationId}/import-batches/${batchId}/rollback`,
      input,
    );
  }

  listCatalogImportReviews() {
    return this.get<CatalogImportReviewQueueResponse>(
      "/moderation/import-reviews",
    );
  }

  approveCatalogImportCandidate(
    candidateId: string,
    input: ApproveImportProductCandidateInput,
  ) {
    return this.post<CatalogImportReview>(
      `/moderation/import-reviews/${candidateId}/approve`,
      input,
    );
  }

  setSupplierOfferPublication(
    supplierOrganizationId: string,
    offerId: string,
    input: SetOfferPublicationInput,
  ) {
    return this.put<SupplierOfferPublicationResponse>(
      `/suppliers/${supplierOrganizationId}/offers/${offerId}/publication`,
      input,
    );
  }

  listOutboxDeadLetters(input: OutboxDeadLetterQueryInput = {}) {
    return this.get<OutboxDeadLetterListResponse>(
      this.withQuery("/operations/outbox/dead-letter", input),
    );
  }

  replayOutboxDeadLetter(eventId: string, input: OutboxReplayInput) {
    return this.post<OutboxReplayResponse>(
      `/operations/outbox/dead-letter/${eventId}/replay`,
      input,
    );
  }
}
