import type { MarketplaceApiClient } from "@marketplace/api-client";
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
} from "./features/supplier-workspace/types";

type SupplierApiReader = Pick<MarketplaceApiClient, "get">;

export type SupplierSectionData = Partial<{
  offers: Offer[];
  balances: Balance[];
  orders: SupplierOrder[];
  integrations: Integration[];
  credentials: Credential[];
  checks: ComplianceCheck[];
  documents: DocumentRecord[];
  merchantAccounts: MerchantAccount[];
  policies: FreshnessPolicy[];
  overrides: DataOverride[];
  dataSources: SupplierDataSource[];
  importBatches: ImportBatch[];
  externalItems: ExternalCatalogItem[];
}>;

export async function loadSupplierSectionData(
  api: SupplierApiReader,
  supplierId: string,
  section: string,
): Promise<SupplierSectionData> {
  switch (section) {
    case "dashboard": {
      const [offers, balances, orders, integrations, credentials, checks, policies] =
        await Promise.all([
          api.get<Offer[]>(`/suppliers/${supplierId}/offers`),
          api.get<Balance[]>(`/suppliers/${supplierId}/inventory/balances`),
          api.get<SupplierOrder[]>("/supplier-orders"),
          api.get<Integration[]>(`/suppliers/${supplierId}/integrations`),
          api.get<Credential[]>(`/compliance/organizations/${supplierId}/credentials`),
          api.get<ComplianceCheck[]>("/compliance/checks"),
          api.get<FreshnessPolicy[]>(
            `/suppliers/${supplierId}/inventory/freshness/policies`,
          ),
        ]);
      return { offers, balances, orders, integrations, credentials, checks, policies };
    }
    case "offers":
      return {
        offers: await api.get<Offer[]>(`/suppliers/${supplierId}/offers`),
      };
    case "inventory": {
      const [balances, overrides] = await Promise.all([
        api.get<Balance[]>(`/suppliers/${supplierId}/inventory/balances`),
        api.get<DataOverride[]>(`/suppliers/${supplierId}/inventory/overrides`),
      ]);
      return { balances, overrides };
    }
    case "orders":
      return { orders: await api.get<SupplierOrder[]>("/supplier-orders") };
    case "integrations": {
      const [integrations, dataSources, importBatches, externalItems] =
        await Promise.all([
          api.get<Integration[]>(`/suppliers/${supplierId}/integrations`),
          api.get<SupplierDataSource[]>(`/suppliers/${supplierId}/data-sources`),
          api.get<ImportBatch[]>(`/suppliers/${supplierId}/import-batches`),
          api.get<ExternalCatalogItem[]>(`/suppliers/${supplierId}/external-items`),
        ]);
      return { integrations, dataSources, importBatches, externalItems };
    }
    case "compliance": {
      const [credentials, checks] = await Promise.all([
        api.get<Credential[]>(`/compliance/organizations/${supplierId}/credentials`),
        api.get<ComplianceCheck[]>("/compliance/checks"),
      ]);
      return { credentials, checks };
    }
    case "documents": {
      const [documents, merchantAccounts] = await Promise.all([
        api.get<DocumentRecord[]>(
          `/documents?ownerOrganizationId=${supplierId}&limit=100`,
        ),
        api.get<MerchantAccount[]>(
          `/organizations/${supplierId}/payment-merchant-accounts`,
        ),
      ]);
      return { documents, merchantAccounts };
    }
    default:
      return {};
  }
}
