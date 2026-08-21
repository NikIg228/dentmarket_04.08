import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "./providers";
import "@marketplace/ui/styles.css";
import "./globals.css";

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Marketplace Operations",
  description: "Рабочий кабинет команды DentMarket",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // A per-request render is required so Next can apply the CSP nonce generated
  // by middleware to its bootstrap scripts.
  await headers();
  return (
    <html lang="ru">
      <body className={manrope.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
