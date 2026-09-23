import AppHeader from "@/components/AppHeader";
import FraudNetworkGraph from "@/components/FraudNetworkGraph";
export const metadata = { title: "Fraud network · FraudLens", robots: { index: false, follow: false }, alternates: { canonical: null } };
export default async function NetworkPage({ params }: { params: Promise<{ fingerprintId: string }> }) {
  const { fingerprintId } = await params;
  return <main><AppHeader /><FraudNetworkGraph fingerprintId={fingerprintId} /></main>;
}
