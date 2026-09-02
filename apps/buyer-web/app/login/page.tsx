import { redirect } from "next/navigation";
import { loginUrl } from "../public-links";

/**
 * Compatibility route for old Marketplace links. Authentication is owned by
 * landing-web so Buyer does not ship a second login flow or visual system.
 */
export default function LegacyLoginPage() {
  redirect(loginUrl);
}
