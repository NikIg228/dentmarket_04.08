import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { MarketplaceProvider } from "@marketplace/ui";
import "@marketplace/ui/styles.css";
import "./styles.css";

const manrope = Manrope({ subsets: ["cyrillic", "latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "DentMarket KZ: закупки для стоматологий",
  description: "Материалы и оборудование для стоматологий Казахстана: сравнение цен, наличие, документы и договор с ЭЦП.",
  keywords: ["стоматология", "закупки", "B2B marketplace", "Казахстан", "стоматологические материалы"],
  openGraph: { title: "DentMarket KZ", description: "Прозрачные закупки для клиник и единый канал продаж для поставщиков.", type: "website", locale: "ru_KZ" },
};

export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="ru"><body className={manrope.variable}><MarketplaceProvider>{children}</MarketplaceProvider></body></html>; }
