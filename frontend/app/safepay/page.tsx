import BeforePayingScreen from "@/components/safepay/BeforePayingScreen";

export const metadata = {
  title: "Before paying",
  description: "Check a phone number, bank account or IBAN's report history and format before you send money.",
  alternates: { canonical: "/safepay" },
};

/**
 * "Before paying" (Before Paying.dc.html): a deterministic, read-only check
 * on a payee identifier via POST /api/check-payee - see
 * components/safepay/BeforePayingScreen.tsx.
 */
export default function SafePayPage() {
  return (
    <main>
      <BeforePayingScreen />
    </main>
  );
}
