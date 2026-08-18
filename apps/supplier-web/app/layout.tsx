import type { Metadata } from "next";
import { connection } from "next/server";
import { Inter } from "next/font/google";
import { MarketplaceProvider } from "@marketplace/ui";
import "@marketplace/ui/styles.css";
import "./globals.css";

const inter = Inter({
  subsets: ["cyrillic", "latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "DentMarket для поставщиков",
  description: "Управление продажами и исполнением заказов",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // A request-scoped render is required for Next.js to attach the CSP nonce to
  // its bootstrap and hydration scripts.
  await connection();
  return (
    <html lang="ru">
      <body className={inter.variable}>
        <MarketplaceProvider>{children}</MarketplaceProvider>
      </body>
    </html>
  );
}
