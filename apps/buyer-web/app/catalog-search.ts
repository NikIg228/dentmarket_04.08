export const dentalSearchAliases: Record<string, string[]> = {
  светник: ["светильник", "лампа"],
  текучка: ["композит", "текучий"],
  коффер: ["коффердам", "изоляция"],
  гутта: ["гуттаперча"],
  карпулы: ["карпула", "анестезия"],
  перчаткии: ["перчатки"],
  "перчатки нитрил": ["перчатки нитриловые"],
  компазит: ["композит"],
  композитт: ["композит"],
  гуттаперчя: ["гуттаперча"],
  эндодонтия: ["эндо", "эндодонтический"],
  эндошка: ["эндодонтия", "эндодонтический", "эндомотор"],
};

export function canonicalSearchQuery(query: string) {
  const normalized = query.trim().toLocaleLowerCase("ru");
  return dentalSearchAliases[normalized]?.[0] ?? query.trim();
}
