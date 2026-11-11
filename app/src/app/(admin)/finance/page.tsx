/** /finance folded into the Dashboard's Money tab (its row lists live on in ./rows.tsx). */
import { redirect } from "next/navigation";

export default function FinancePage() {
    redirect("/dashboard?tab=money");
}
