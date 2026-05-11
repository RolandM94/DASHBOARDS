import type { Metadata } from "next";
import { DashboardTemplateGallery } from "@/components/templates/DashboardTemplateGallery";

export const metadata: Metadata = {
  title: "Dashboard Templates | Supercoolstuff",
  description: "Browse public dashboard templates and customize one for your own data.",
};

export default function PublicTemplatesPage() {
  return <DashboardTemplateGallery mode="public" />;
}
