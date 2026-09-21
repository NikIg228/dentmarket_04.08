const landingUrl = process.env.NEXT_PUBLIC_LANDING_APP_URL ??
  (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3003" : "https://dentmarket-kz.vercel.app");

export const loginUrl = process.env.NEXT_PUBLIC_LOGIN_URL ?? `${landingUrl}/login`;
