export type ResourceOrganization = {
  id: string;
  displayName?: string | null;
  legalName?: string | null;
  bin?: string | null;
  capabilities?: Array<{ capability: string }> | null;
};

export type ResourceProduct = {
  id: string;
  canonicalName?: string | null;
  status?: string | null;
  productType?: string | null;
  variants?: Array<{ id: string }> | null;
  categories?: Array<{ category?: { nameRu?: string | null } | null }> | null;
};

const capabilityLabels: Record<string, string> = {
  BUYER: "Покупатель",
  SUPPLIER: "Поставщик",
  IMPORTER: "Импортёр",
  LOGISTICS_PROVIDER: "Логистика",
  SERVICE_PROVIDER: "Сервис",
  MARKETPLACE_OPERATOR: "Оператор",
  PAYMENT_PARTNER: "Платёжный партнёр",
};

const productStatusLabels: Record<string, string> = {
  ACTIVE: "Активна",
  DRAFT: "Черновик",
  INACTIVE: "Неактивна",
  ARCHIVED: "В архиве",
};

export function getOrganizationSummary(organization: ResourceOrganization) {
  const capabilities = (organization.capabilities ?? [])
    .map(({ capability }) => capabilityLabels[capability] ?? capability)
    .join(", ");

  return {
    displayName: organization.displayName?.trim() || "Организация без названия",
    legalName:
      organization.legalName?.trim() || "Юридическое наименование не указано",
    bin: organization.bin?.trim() ? `БИН ${organization.bin}` : "БИН не указан",
    capabilities: capabilities || "Роль не указана",
  };
}

export function getProductSummary(product: ResourceProduct) {
  const categories = (product.categories ?? [])
    .map(({ category }) => category?.nameRu?.trim())
    .filter((name): name is string => Boolean(name))
    .join(", ");
  const status = product.status?.trim() || "UNKNOWN";

  return {
    canonicalName: product.canonicalName?.trim() || "Карточка без названия",
    categories: categories || "Без категории",
    productType: product.productType?.trim() || "Тип не указан",
    variants: product.variants?.length ?? 0,
    status,
    statusLabel: productStatusLabels[status] ?? status,
    statusTone: status === "ACTIVE" ? ("success" as const) : ("neutral" as const),
  };
}
