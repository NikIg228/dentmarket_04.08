import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { organizationProfileFieldsSchema, type OrganizationProfileResponse, type SaveOrganizationProfileInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { AuthorityActorContext } from "../access-control/platform-authority.policy";

const includeProfile = { legalAddress: true, deliveryAddress: true } as const;
type Database = Prisma.TransactionClient;

export async function organizationProfileFields(db: Database, organizationId: string) {
  const profile = await db.organizationProfile.findUnique({ where: { organizationId }, include: includeProfile });
  if (!profile || profile.legalAddress.organizationId !== organizationId || profile.deliveryAddress.organizationId !== organizationId) return null;
  const address = (value: typeof profile.legalAddress) => ({ cityId: value.cityId, line1: value.line1, postalCode: value.postalCode });
  const result = organizationProfileFieldsSchema.safeParse({ contactName: profile.contactName, phone: profile.phone, email: profile.email,
    legalAddress: address(profile.legalAddress), deliveryAddress: address(profile.deliveryAddress) });
  return result.success ? result.data : null;
}

export async function assertOrganizationProfileComplete(db: Database, organizationId: string) {
  if (!await organizationProfileFields(db, organizationId)) throw new ConflictException({ code: "ORGANIZATION_PROFILE_REQUIRED", message: "Завершите анкету организации: контакты, юридический адрес и адрес доставки" });
}

// These checks describe organization onboarding, never assortment/import quality.
export async function supplierOrganizationPrerequisites(db: Database, organizationId: string) {
  const [profile, warehouses, credentials] = await Promise.all([
    organizationProfileFields(db, organizationId),
    db.warehouse.findMany({ where: { supplierOrganizationId: organizationId, status: "ACTIVE", cityId: { not: null }, addressLine: { not: null } }, select: { addressLine: true } }),
    db.organizationCredential.count({ where: { organizationId, status: "VERIFIED", AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] }, { OR: [{ validTo: null }, { validTo: { gt: new Date() } }] }] } }),
  ]);
  return { profileComplete: Boolean(profile), warehouseComplete: warehouses.some(item => (item.addressLine?.trim().length ?? 0) >= 5), credentialsComplete: credentials > 0 };
}

@Injectable()
export class OrganizationProfileService {
  constructor(private readonly prisma: PrismaService) {}

  private async member(context: AuthorityActorContext, write: boolean, db: Database = this.prisma) {
    if (!context.actorId || !context.organizationId) throw new ForbiddenException("Войдите в организацию");
    const member = await db.organizationMembership.findFirst({
      where: { userId: context.actorId, organizationId: context.organizationId, status: "ACTIVE", user: { status: "ACTIVE" },
        organization: { status: "ACTIVE", capabilities: { some: { capability: { in: ["BUYER", "SUPPLIER"] } } } },
        roles: { some: { role: { organizationId: context.organizationId, permissions: { some: { permission: { code: write ? "organization.members.manage" : "organization.view" } } } } } },
      }, include: { organization: true },
    });
    if (!member) throw new ForbiddenException(write ? "Заполнить анкету может владелец или сотрудник с правом управления организацией" : "Нет доступа к организации");
    return member;
  }

  async current(context: AuthorityActorContext): Promise<OrganizationProfileResponse> {
    const { organization } = await this.member(context, false);
    let canEdit = false;
    try { await this.member(context, true); canEdit = true; } catch (error) { if (!(error instanceof ForbiddenException)) throw error; }
    const profile = await organizationProfileFields(this.prisma, organization.id);
    return { organizationId: organization.id, legalName: organization.legalName, displayName: organization.displayName, bin: organization.bin,
      version: organization.version, profile, complete: Boolean(profile), canEdit };
  }

  async save(input: SaveOrganizationProfileInput, context: AuthorityActorContext) {
    await this.member(context, true);
    const { expectedVersion: _expectedVersion, idempotencyKey: _key, ...values } = input;
    const fields = organizationProfileFieldsSchema.parse(values);
    const requestHash = createHash("sha256").update(JSON.stringify({ ...fields, expectedVersion: input.expectedVersion })).digest("hex");
    const scope = `organization-profile:${context.organizationId}`;
    try {
      await this.prisma.$transaction(async tx => {
        const { organization } = await this.member(context, true, tx);
        const previous = await tx.idempotencyRecord.findUnique({ where: { scope_key: { scope, key: input.idempotencyKey } } });
        if (previous) {
          if (previous.requestHash !== requestHash) throw new ConflictException("Ключ повтора принадлежит другой версии анкеты");
          return;
        }
        if (organization.version !== input.expectedVersion) throw new ConflictException("Реквизиты изменились. Обновите анкету перед сохранением");
        const stored = await tx.organizationProfile.findUnique({ where: { organizationId: organization.id }, include: includeProfile });
        const existing = await organizationProfileFields(tx, organization.id);
        if (JSON.stringify(existing) !== JSON.stringify(fields)) {
          const cities = await tx.city.findMany({ where: { id: { in: [fields.legalAddress.cityId, fields.deliveryAddress.cityId] } }, include: { region: true } });
          const saveAddress = async (address: typeof fields.legalAddress, id?: string) => {
            const city = cities.find(value => value.id === address.cityId);
            if (!city) throw new BadRequestException("Выберите город из справочника");
            const data = { ...address, organizationId: organization.id, regionId: city.regionId, countryId: city.region.countryId };
            if (!id) return tx.address.create({ data });
            const changed = await tx.address.updateMany({ where: { id, organizationId: organization.id }, data: { ...data, version: { increment: 1 }, latitude: null, longitude: null, geoMethod: null, geoStatus: "UNVERIFIED", geoVerifiedAt: null, geoVerifiedById: null, geoEvidence: Prisma.DbNull } });
            if (changed.count !== 1) throw new ConflictException("Адрес организации изменился");
            return { id };
          };
          const legalAddress = await saveAddress(fields.legalAddress, stored?.legalAddressId);
          // A legacy profile can point both purposes at one Address. Split on edit
          // so a different delivery address never overwrites the legal address.
          const deliveryAddress = await saveAddress(fields.deliveryAddress, stored?.deliveryAddressId === stored?.legalAddressId ? undefined : stored?.deliveryAddressId);
          const data = { contactName: fields.contactName, phone: fields.phone, email: fields.email, legalAddressId: legalAddress.id, deliveryAddressId: deliveryAddress.id };
          await tx.organizationProfile.upsert({ where: { organizationId: organization.id }, create: { organizationId: organization.id, ...data }, update: data });
          const updated = await tx.organization.updateMany({ where: { id: organization.id, version: input.expectedVersion }, data: { version: { increment: 1 } } });
          if (updated.count !== 1) throw new ConflictException("Реквизиты изменились. Обновите страницу");
          await tx.auditLog.create({ data: { ...context, action: "organization.profile.saved", entityType: "Organization", entityId: organization.id,
            after: { version: input.expectedVersion + 1, profileComplete: true } } });
          await tx.outboxEvent.create({ data: { aggregateType: "Organization", aggregateId: organization.id, eventType: "OrganizationProfileUpdated", payload: { organizationId: organization.id, version: input.expectedVersion + 1 } } });
        }
        await tx.idempotencyRecord.create({ data: { scope, key: input.idempotencyKey, requestHash, responseCode: 200, responseBody: { organizationId: organization.id }, expiresAt: new Date(Date.now() + 86400_000) } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new ConflictException("Анкета уже изменяется. Повторите сохранение после обновления");
      throw error;
    }
    return this.current(context);
  }
}
