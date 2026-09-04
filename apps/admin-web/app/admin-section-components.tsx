"use client";

import { LoadingState } from "@marketplace/ui";
import dynamic from "next/dynamic";

const loading = () => <LoadingState label="Загружаем раздел" />;

export const AgreementOperations = dynamic(
  () =>
    import("./agreement-operations").then(
      (module) => module.AgreementOperations,
    ),
  { loading },
);
export const AuditOperations = dynamic(
  () => import("./audit-operations").then((module) => module.AuditOperations),
  { loading },
);
export const CatalogFoundation = dynamic(
  () =>
    import("./catalog-foundation").then((module) => module.CatalogFoundation),
  { loading },
);
export const CatalogImportReviewQueue = dynamic(
  () =>
    import("./catalog-import-review").then(
      (module) => module.CatalogImportReviewQueue,
    ),
  { loading },
);
export const CatalogQuality = dynamic(
  () => import("./catalog-quality").then((module) => module.CatalogQuality),
  { loading },
);
export const ConnectorReadinessRegistry = dynamic(
  () =>
    import("./connector-readiness-registry").then(
      (module) => module.ConnectorReadinessRegistry,
    ),
  { loading },
);
export const FoundationManagement = dynamic(
  () =>
    import("./foundation-management").then(
      (module) => module.FoundationManagement,
    ),
  { loading },
);
export const IntegrationOperations = dynamic(
  () =>
    import("./integration-operations").then(
      (module) => module.IntegrationOperations,
    ),
  { loading },
);
export const OrganizationQuickCreate = dynamic(
  () =>
    import("./organization-quick-create").then(
      (module) => module.OrganizationQuickCreate,
    ),
  { loading },
);
export const PlatformAssurance = dynamic(
  () =>
    import("./platform-assurance").then((module) => module.PlatformAssurance),
  { loading },
);
export const PlatformSettings = dynamic(
  () =>
    import("./platform-settings").then((module) => module.PlatformSettings),
  { loading },
);
export const ProductCorrectionQueue = dynamic(
  () =>
    import("./product-correction-queue").then(
      (module) => module.ProductCorrectionQueue,
    ),
  { loading },
);
export const ResourceLists = dynamic(
  () => import("./resource-lists").then((module) => module.ResourceLists),
  { loading },
);
export const SupplierControls = dynamic(
  () => import("./supplier-controls").then((module) => module.SupplierControls),
  { loading },
);
export const SupplierOperations = dynamic(
  () =>
    import("./supplier-operations").then((module) => module.SupplierOperations),
  { loading },
);
export const TrustOperations = dynamic(
  () => import("./trust-operations").then((module) => module.TrustOperations),
  { loading },
);
