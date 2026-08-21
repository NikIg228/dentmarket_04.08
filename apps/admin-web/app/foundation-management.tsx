"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { DmButton, DmCheckbox, DmField, DmInput, DmSelect } from "@marketplace/ui";
import styles from "./foundation-management.module.css";
import { adminAuthHeaders } from "./admin-auth";

type Role = {
  id: string;
  name: string;
  code: string;
  permissions: Array<{ permission: { code: string } }>;
};
type Membership = {
  id: string;
  status: string;
  title?: string | null;
  user: { displayName: string; email: string };
  roles: Array<{ role: Role }>;
};
type Attribute = {
  id: string;
  code: string;
  nameRu: string;
  valueType: string;
};
type Category = { id: string; nameRu: string; path: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const organizationId =
  process.env.NEXT_PUBLIC_DEV_ORGANIZATION_ID ??
  "00000000-0000-4000-8000-000000000001";

export function FoundationManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        headers: { ...adminAuthHeaders(), ...init?.headers },
      });
      if (!response.ok) throw new Error(`API вернул статус ${response.status}`);
      return response.json() as Promise<T>;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roleData, membershipData, attributeData, categoryData] =
        await Promise.all([
          request<Role[]>(`/organizations/${organizationId}/roles`),
          request<Membership[]>(`/organizations/${organizationId}/memberships`),
          request<Attribute[]>("/catalog/attributes"),
          request<Category[]>("/catalog/categories"),
        ]);
      setRoles(roleData);
      setMemberships(membershipData);
      setAttributes(attributeData);
      setCategories(categoryData);
      setMessage("");
    } catch {
      setMessage("Управление недоступно до запуска API и применения seed.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request(`/organizations/${organizationId}/roles`, {
        method: "POST",
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          permissionCodes: String(form.get("permissions"))
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      event.currentTarget.reset();
      await load();
      setMessage("Роль создана.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать роль.",
      );
    }
  }

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request(
        `/organizations/${organizationId}/memberships/${form.get("membershipId")}/roles`,
        {
          method: "POST",
          body: JSON.stringify({ roleId: form.get("roleId") }),
        },
      );
      await load();
      setMessage("Роль назначена участнику.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось назначить роль.",
      );
    }
  }

  async function submitAttribute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request("/catalog/attributes", {
        method: "POST",
        body: JSON.stringify({
          code: form.get("code"),
          nameRu: form.get("nameRu"),
          nameKk: form.get("nameKk"),
          valueType: form.get("valueType"),
          isSearchable: form.get("isSearchable") === "on",
          isFilterable: form.get("isFilterable") === "on",
        }),
      });
      event.currentTarget.reset();
      await load();
      setMessage("Определение атрибута создано.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать атрибут.",
      );
    }
  }

  async function submitRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request(
        `/catalog/categories/${form.get("categoryId")}/attribute-rules`,
        {
          method: "PUT",
          body: JSON.stringify({
            attributeId: form.get("attributeId"),
            isRequired: form.get("isRequired") === "on",
            isVariant: form.get("isVariant") === "on",
            sortOrder: Number(form.get("sortOrder") || 0),
          }),
        },
      );
      setMessage("Правило категории сохранено.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить правило.",
      );
    }
  }

  return (
    <section className={styles.section} aria-label="Роли и справочники">
      <div className={styles.heading}>
        <div>
          <h2>Роли и справочники</h2>
          <p>Роли, участники и конфигурация динамических атрибутов.</p>
        </div>
        <DmButton type="button" appearance="secondary" onClick={() => void load()}>Обновить данные</DmButton>
      </div>
      {message && (
        <div className={styles.notice} role="status">
          {message}
        </div>
      )}
      {loading ? (
        <div className={styles.loading} aria-label="Загрузка управления">
          <i />
          <i />
        </div>
      ) : (
        <div className={styles.grid}>
          <div className={styles.panel}>
            <h3>Роли и участники</h3>
            <form className={styles.form} onSubmit={submitRole}>
              <DmField label="Код роли" required>
                <DmInput name="code" required placeholder="procurement_manager" />
              </DmField>
              <DmField label="Название" required>
                <DmInput name="name" required placeholder="Закупщик" />
              </DmField>
              <DmField className={styles.wide} label="Permissions через запятую" hint="Разделяйте коды запятыми" required>
                <DmInput
                  name="permissions"
                  required
                  placeholder="order.create, catalog.product.view"
                />
              </DmField>
              <DmButton type="submit" appearance="primary" className={styles.primary}>Создать роль</DmButton>
            </form>
            <form className={styles.form} onSubmit={assignRole}>
              <DmField label="Участник" required>
                <DmSelect name="membershipId" required>
                  <option value="">Выберите</option>
                  {memberships.map((membership) => (
                    <option value={membership.id} key={membership.id}>
                      {membership.user.displayName}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmField label="Роль" required>
                <DmSelect name="roleId" required>
                  <option value="">Выберите</option>
                  {roles.map((role) => (
                    <option value={role.id} key={role.id}>
                      {role.name}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmButton type="submit" appearance="secondary" className={styles.secondary}>Назначить</DmButton>
            </form>
            <div className={styles.records}>
              {memberships.length === 0 ? (
                <p>Активных memberships нет.</p>
              ) : (
                memberships.map((membership) => (
                  <div className={styles.record} key={membership.id}>
                    <div>
                      <strong>{membership.user.displayName}</strong>
                      <span>{membership.user.email}</span>
                    </div>
                    <div>
                      {membership.roles
                        .map(({ role }) => role.name)
                        .join(", ") || "Без роли"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <h3>Атрибуты каталога</h3>
            <form className={styles.form} onSubmit={submitAttribute}>
              <DmField label="Код" required>
                <DmInput name="code" required placeholder="glove_material" />
              </DmField>
              <DmField label="Тип">
                <DmSelect name="valueType" defaultValue="TEXT">
                  <option>TEXT</option>
                  <option>INTEGER</option>
                  <option>DECIMAL</option>
                  <option>BOOLEAN</option>
                  <option>OPTION</option>
                  <option>MULTI_OPTION</option>
                  <option>RANGE</option>
                  <option>NUMBER_WITH_UNIT</option>
                </DmSelect>
              </DmField>
              <DmField label="Название RU" required>
                <DmInput name="nameRu" required />
              </DmField>
              <DmField label="Название KZ" required>
                <DmInput name="nameKk" required />
              </DmField>
              <DmCheckbox className={styles.check} name="isSearchable" label="Поиск" />
              <DmCheckbox className={styles.check} name="isFilterable" label="Фильтр" />
              <DmButton type="submit" appearance="primary" className={styles.primary}>Создать атрибут</DmButton>
            </form>
            <form className={styles.form} onSubmit={submitRule}>
              <DmField label="Категория" required>
                <DmSelect name="categoryId" required>
                  <option value="">Выберите</option>
                  {categories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.nameRu}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmField label="Атрибут" required>
                <DmSelect name="attributeId" required>
                  <option value="">Выберите</option>
                  {attributes.map((attribute) => (
                    <option value={attribute.id} key={attribute.id}>
                      {attribute.nameRu}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmField label="Порядок" hint="Неотрицательное число">
                <DmInput
                  name="sortOrder"
                  type="number"
                  min="0"
                  defaultValue="0"
                />
              </DmField>
              <DmCheckbox className={styles.check} name="isRequired" label="Обязательный" />
              <DmCheckbox className={styles.check} name="isVariant" label="Для варианта" />
              <DmButton type="submit" appearance="secondary" className={styles.secondary}>Сохранить правило</DmButton>
            </form>
            <div className={styles.records}>
              {attributes.length === 0 ? (
                <p>Определений атрибутов нет.</p>
              ) : (
                attributes.slice(0, 8).map((attribute) => (
                  <div className={styles.record} key={attribute.id}>
                    <div>
                      <strong>{attribute.nameRu}</strong>
                      <span>{attribute.code}</span>
                    </div>
                    <div>{attribute.valueType}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
