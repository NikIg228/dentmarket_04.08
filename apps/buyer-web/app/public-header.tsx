"use client";

import Link from "next/link";
import { Search24Regular } from "@fluentui/react-icons/svg/search";
import { DmButton, DmInput } from "@marketplace/ui";
import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { loginUrl } from "./public-links";
import { CityLocation } from "./city-location";
import { usePopupDismiss } from "./use-popup-dismiss";
import styles from "./public-header.module.css";

type PublicSection = "catalog" | "suppliers" | "about";

type PublicHeaderProps = {
  active: PublicSection;
  baseHref?: string;
  query?: string;
  searching?: boolean;
  onQueryChange?: (value: string) => void;
  onSearch?: (value?: string) => void;
  recentSearches?: string[];
  loginHref?: string;
};

const searchSuggestions = [
  "перчатки",
  "перчатки нитриловые",
  "перчатки хирургические",
  "маски медицинские",
  "текучий композит",
  "композит",
  "гуттаперча",
  "силер",
  "эндодонтические файлы",
  "стоматологические боры",
  "слюноотсосы",
  "стерилизация",
  "импланты",
  "абатменты",
];

export function PublicHeader({ active, baseHref = "/", query = "", searching = false, onQueryChange, onSearch, recentSearches = [], loginHref = loginUrl }: PublicHeaderProps) {
  const searchRef = useRef<HTMLFormElement>(null);
  const suggestionsId = useId();
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setActiveSuggestion(-1);
  }, []);
  usePopupDismiss(searchRef, searchOpen, closeSearch);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const suggestions = normalizedQuery.length < 2
    ? recentSearches.slice(0, 4)
    : searchSuggestions
        .filter((suggestion) => suggestion.includes(normalizedQuery) && suggestion !== normalizedQuery)
        .slice(0, 6);
  const showSuggestions = searchOpen && suggestions.length > 0;
  const chooseSuggestion = (suggestion: string) => {
    closeSearch();
    onQueryChange?.(suggestion);
    onSearch?.(suggestion);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!onSearch) return;
    event.preventDefault();
    closeSearch();
    onSearch(query);
  };

  return (
    <header className={`${styles.header} ${onSearch ? styles.headerCatalog : styles.headerSimple}`}>
      <Link className={styles.brand} href={baseHref} aria-label="DentMarket, магазин">
        <span className={styles.mark}>DM</span>
        <span className={styles.brandCopy}>
          <strong>DentMarket</strong>
          <small>Закупки для стоматологий</small>
        </span>
      </Link>
      <nav className={styles.nav} aria-label="Основная навигация">
        <Link className={active === "catalog" ? styles.active : undefined} href={baseHref}>
          Каталог
        </Link>
        <Link className={active === "suppliers" ? styles.active : undefined} href="/suppliers">
          Поставщикам
        </Link>
        <Link className={active === "about" ? styles.active : undefined} href="/about">
          О DentMarket
        </Link>
      </nav>
      {onSearch ? (
        <form ref={searchRef} className={styles.search} role="search" method="get" action="/" onSubmit={submit}>
          <Search24Regular aria-hidden="true" />
          <DmInput
            type="search"
            name="q"
            value={query}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? suggestionsId : undefined}
            aria-activedescendant={showSuggestions && activeSuggestion >= 0 && activeSuggestion < suggestions.length ? `${suggestionsId}-${activeSuggestion}` : undefined}
            onFocus={() => setSearchOpen(true)}
            onClick={() => setSearchOpen(true)}
            onBlur={closeSearch}
            onChange={(_, data) => {
              setSearchOpen(true);
              setActiveSuggestion(-1);
              onQueryChange?.(data.value);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
                event.preventDefault();
                setSearchOpen(true);
                setActiveSuggestion((current) => {
                  if (!showSuggestions || current < 0) return event.key === "ArrowDown" ? 0 : suggestions.length - 1;
                  return (current + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
                });
              } else if (event.key === "Enter" && showSuggestions && suggestions[activeSuggestion]) {
                event.preventDefault();
                chooseSuggestion(suggestions[activeSuggestion]);
              }
            }}
            placeholder="Найти товар, бренд или артикул"
            aria-label="Поиск по каталогу"
          />
          <DmButton type="submit" appearance="secondary" disabled={searching}>
            {searching ? "Ищем" : "Найти"}
          </DmButton>
          {showSuggestions ? (
            <div id={suggestionsId} className={styles.suggestions} role="listbox" aria-label="Подсказки поиска">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  id={`${suggestionsId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestion}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(suggestion)}
                >
                  <Search24Regular aria-hidden="true" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          ) : null}
        </form>
      ) : null}
      <CityLocation />
      <a className={styles.login} href={loginHref}>
        Войти
      </a>
    </header>
  );
}
