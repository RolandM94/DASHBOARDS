import type { Metadata } from "next";
import { AnalyticsHome } from "@/components/analytics/home/AnalyticsHome";

export const metadata: Metadata = {
  title: "Analytics | Eyemark",
};

export default function AnalyticsPage() {
  return <AnalyticsHome />;
}
