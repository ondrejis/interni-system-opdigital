import { authBrand } from "@/lib/auth-brand";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Zapomenuté heslo" };

export default async function ForgotPage() {
  return <ForgotForm brand={await authBrand()} />;
}
