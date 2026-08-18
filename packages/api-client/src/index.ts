import type {
  AddCartItemRequest,
  CartItemResponse,
  CartResponse,
  CartValidationResponse,
  CatalogSearchResponse,
  CheckoutCartRequest,
  CheckoutResponse,
  CompareOffersRequest,
  ConfirmSupplierOrderRequest,
  GenerateOrderDocumentPackRequest,
  CreateShipmentRequest,
  OrderDocumentPackResponse,
  CreateCartRequest,
  OfferComparisonResponse,
  SearchCatalogRequest,
  SupplierOrderResponse,
  ShipmentResponse,
  TransitionShipmentRequest,
} from "@marketplace/schemas";

export type { OrderDocumentResponse } from "@marketplace/schemas";

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
    return {
      blob: await response.blob(),
      fileName: encodedName ? decodeURIComponent(encodedName) : null,
    };
  }

  get<T>(path: string) {
    return this.request<T>(path);
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

  repriceCart(cartId: string) {
    return this.post<CartResponse>(`/carts/${cartId}/reprice`);
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

  transitionShipment(
    shipmentId: string,
    input: TransitionShipmentRequest,
  ) {
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
}
