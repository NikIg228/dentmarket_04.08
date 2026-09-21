export type DocumentRelationOption = { id: string; label: string; description: string };
export type DocumentRelationPage = { items: DocumentRelationOption[]; hasMore: boolean };
export type DocumentRelationLoader = (query: string) => Promise<DocumentRelationPage>;
type Organization = { id: string; displayName: string; legalName: string };
type Order = { id: string; orderNumber: string; status: string; createdAt: string; buyerOrganizationId: string; supplierOrganizationId: string; buyer?: Organization; supplier?: Organization };
type Agreement = { id: string; category: string; documentNumber: string; title: string; version: number; status: string; documentDate: string; participants: { organizationId: string; organization: Organization }[] };
const statuses: Record<string, string> = { DRAFT:'Черновик', PENDING:'Ожидает обработки', CREATED:'Создан', PLACED:'Размещён', CONFIRMED:'Подтверждён', PARTIALLY_CONFIRMED:'Частично подтверждён', REJECTED:'Отклонён', CANCELLED:'Отменён', COMPLETED:'Завершён', SHIPPED:'Отгружен', DELIVERED:'Доставлен', PARTIALLY_DELIVERED:'Частично доставлен', GENERATED:'Готов', GENERATING:'Формируется', AWAITING_SIGNATURE:'Ожидает подписи', PARTIALLY_SIGNED:'Подписан частично', SIGNED:'Подписан', EXPIRED:'Истёк', SUPERSEDED:'Есть новая версия', ARCHIVED:'Архивирован', FAILED:'Ошибка' };
const dateLabel = (date: string) => Number.isFinite(Date.parse(date)) ? new Intl.DateTimeFormat('ru-KZ', {day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(date)) : 'Дата не указана';
Object.assign(statuses, {AWAITING_CONFIRMATION:'Ожидает подтверждения',RESERVED:'Зарезервирован',AWAITING_PAYMENT:'Ожидает оплаты',PAID:'Оплачен',ASSEMBLING:'Собирается',READY_TO_SHIP:'Готов к отгрузке',IN_TRANSIT:'В пути',PARTIALLY_FULFILLED:'Получен частично',RETURN_DISPUTE:'Возврат или спор'});
const organizationLabel = (org?: Organization) => org?.displayName || org?.legalName || 'Контрагент не указан';
export function documentOrderOptions(orders: Order[], organizationId: string, query: string): DocumentRelationPage {
  const needle = query.trim().toLocaleLowerCase('ru');
  const items = orders.filter(order => [order.buyerOrganizationId,order.supplierOrganizationId].includes(organizationId)).map(order => ({
    id: order.id,
    label: `Заказ ${order.orderNumber || 'без номера'}`,
    description: `${organizationLabel(order.buyerOrganizationId === organizationId ? order.supplier : order.buyer)} · ${dateLabel(order.createdAt)} · ${statuses[order.status] ?? order.status}`,
  })).filter(option => `${option.label} ${option.description}`.toLocaleLowerCase('ru').includes(needle));
  return {items:items.slice(0,100),hasMore:items.length>100};
}
export function documentAgreementOptions(documents: Agreement[], organizationId: string, hasMore: boolean): DocumentRelationPage {
  return {items: documents.filter(document => document.category === 'CONTRACT').map(document => ({
    id: document.id,
    label: `${document.documentNumber || 'Без номера'} · ${document.title} · версия ${document.version}`,
    description: `${[...new Set(document.participants.filter(p => p.organizationId !== organizationId).map(p => organizationLabel(p.organization)))].join(', ') || 'Контрагент не указан'} · ${dateLabel(document.documentDate)} · ${statuses[document.status] ?? document.status}`,
  })),hasMore};
}
export function documentRelationError(error: unknown): string {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  if (status === 403) return 'Нет доступа к списку. Попросите администратора организации проверить ваши права.';
  if (status === 401) return 'Сессия истекла. Для получения списка войдите снова.';
  return 'Не удалось получить список. Повторите поиск. Выбранная связь сохранена.';
}
export function createRelationRequestSequence() {
  let version = 0;
  return {next: () => ++version, current: (value: number) => value === version, cancel: () => {version++;}};
}
