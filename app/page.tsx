import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutDashboard,
  LockKeyhole,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Supercoolstuff | AI Analytics Dashboards and Reports",
  description: "Turn datasets into AI-assisted workbooks, dashboards, published links, and export-ready reports.",
};

const navItems = [
  { label: "Product", href: "#product" },
  { label: "Workflow", href: "#workflow" },
  { label: "Reports", href: "#reports" },
  { label: "Security", href: "#security" },
];

const features = [
  {
    icon: Bot,
    title: "AI chart generation",
    text: "Describe the view you need and generate workbook sheets with dimensions, metrics, filters, and chart types.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard publishing",
    text: "Assemble charts, KPIs, text, filters, and previews into shareable dashboards with controlled visibility.",
  },
  {
    icon: Filter,
    title: "Live filtering",
    text: "Keep dashboards useful for repeated analysis with global filters, smart filters, and source-aware views.",
  },
  {
    icon: Share2,
    title: "Dataset sharing",
    text: "Work privately, share with an organisation, or publish selected dashboard links when the audience is broader.",
  },
  {
    icon: FileText,
    title: "AI report generation",
    text: "Create editable report blueprints and narrative sections from the dashboards and canvases you already trust.",
  },
  {
    icon: ShieldCheck,
    title: "Traceable outputs",
    text: "AI writes the narrative while system-calculated data, source snapshots, and audit logs ground every result.",
  },
];

const workflow = [
  { label: "Dataset", icon: Database, text: "Upload structured data" },
  { label: "Workbook", icon: BarChart3, text: "Build charts and KPIs" },
  { label: "Canvas", icon: Workflow, text: "Arrange analysis blocks" },
  { label: "Dashboard", icon: LayoutDashboard, text: "Publish a live view" },
  { label: "AI Report", icon: FileText, text: "Export polished outputs" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Supercoolstuff home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
        <BarChart3 className="h-4.5 w-4.5" />
      </span>
      <span className="font-bold text-base tracking-normal text-text-primary">Supercoolstuff</span>
    </Link>
  );
}

function HeroMockup() {
  const bars = [64, 42, 78, 54, 88, 68];

  return (
    <div className="rounded-lg border border-border bg-white p-3 shadow-[0_18px_60px_rgba(25,72,106,0.12)]">
      <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-bg-offwhite px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-tint-100 text-brand-deep">
            <LayoutDashboard className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-xs font-semibold text-text-primary">Performance dashboard</p>
            <p className="text-[10px] text-grey-muted">Live filters · 6 widgets · AI insights</p>
          </div>
        </div>
        <span className="rounded-md border border-brand-tint-300 bg-white px-2 py-1 text-[10px] font-medium text-brand-deep">
          Published
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_0.72fr]">
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-text-primary">Utilisation trend</p>
                <p className="text-[10px] text-grey-muted">Grouped by programme</p>
              </div>
              <Sparkles className="h-4 w-4 text-gold-orange" />
            </div>
            <div className="flex h-32 items-end gap-2 border-b border-l border-border px-2 pb-2">
              {bars.map((height, index) => (
                <div key={height} className="flex h-full flex-1 items-end gap-1">
                  <span
                    className="w-full rounded-t-sm bg-brand"
                    style={{ height: `${height}%`, opacity: index % 2 === 0 ? 1 : 0.72 }}
                  />
                  <span
                    className="w-full rounded-t-sm bg-gold"
                    style={{ height: `${Math.max(22, height - 18)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-grey-muted">
              <span>Q1</span>
              <span className="text-center">Q2</span>
              <span className="text-right">Q3</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-bg-offwhite p-3">
              <p className="text-[10px] font-medium uppercase text-grey-muted">Completion</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">82%</p>
              <p className="text-[10px] text-status-success">+12% this period</p>
            </div>
            <div className="rounded-lg border border-border bg-bg-offwhite p-3">
              <p className="text-[10px] font-medium uppercase text-grey-muted">Records</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">48k</p>
              <p className="text-[10px] text-grey-muted">Validated rows</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-bg-offwhite p-3">
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-status-info" />
              <p className="text-xs font-semibold">Dataset fields</p>
            </div>
            {["Region", "Programme", "Budget", "Status"].map((field) => (
              <div key={field} className="mb-2 flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-[10px]">
                <span className="font-medium text-text-primary">{field}</span>
                <span className="text-grey-muted">ready</span>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-brand-tint-300 bg-brand-tint-100 p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-deep" />
              <p className="text-xs font-semibold text-brand-deep">AI report draft</p>
            </div>
            <div className="space-y-1.5">
              <span className="block h-2 rounded bg-brand-tint-400" />
              <span className="block h-2 w-10/12 rounded bg-brand-tint-400" />
              <span className="block h-2 w-8/12 rounded bg-brand-tint-400" />
            </div>
            <div className="mt-3 flex gap-2">
              <span className="rounded-md bg-white px-2 py-1 text-[10px] text-brand-deep">PDF</span>
              <span className="rounded-md bg-white px-2 py-1 text-[10px] text-brand-deep">Word</span>
              <span className="rounded-md bg-white px-2 py-1 text-[10px] text-brand-deep">Excel</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-full bg-white text-text-primary">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-medium text-grey-body transition-colors hover:text-brand-deep">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-border bg-bg-offwhite">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-lg border border-brand-tint-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-deep">
              <Sparkles className="h-3.5 w-3.5 text-gold-orange" />
              AI analytics from dataset to board-ready report
            </div>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-normal text-text-primary sm:text-5xl lg:text-6xl">
              Turn raw data into dashboards, insight, and export-ready reports.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-grey-body sm:text-lg">
              Supercoolstuff helps teams upload datasets, build AI-assisted workbooks, publish interactive dashboards, and generate traceable reports without rebuilding the analysis every time.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup">
                <Button size="lg" className="w-full sm:w-auto">
                  Start building
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Sign in
                </Button>
              </Link>
            </div>
            <div className="mt-8 grid gap-3 text-sm text-grey-body sm:grid-cols-3">
              {["Dataset-agnostic", "Source-traceable AI", "No billing step needed"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <HeroMockup />
        </div>
      </section>

      <section id="product" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase text-brand-deep">Product</p>
          <h2 className="mt-2 text-3xl font-bold text-text-primary">Everything a data team needs to move from files to decisions.</h2>
          <p className="mt-3 text-base leading-7 text-grey-body">
            Build the working analytics layer first: datasets, workbooks, dashboards, published links, report projects, and controlled exports.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="rounded-lg border border-border bg-white p-5 shadow-[var(--shadow-card)]">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint-100 text-brand-deep">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="text-base font-semibold text-text-primary">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-grey-body">{feature.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="workflow" className="border-y border-border bg-bg-offwhite">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase text-brand-deep">Workflow</p>
            <h2 className="mt-2 text-3xl font-bold">One flow from upload to executive output.</h2>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-5">
            {workflow.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="rounded-lg border border-border bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-xs font-semibold text-grey-muted">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="font-semibold">{step.label}</h3>
                  <p className="mt-1 text-sm text-grey-body">{step.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="reports" className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div>
          <p className="text-sm font-bold uppercase text-brand-deep">Reports</p>
          <h2 className="mt-2 text-3xl font-bold">Dashboards become polished documents.</h2>
          <p className="mt-3 text-base leading-7 text-grey-body">
            Generate report blueprints, review AI-written sections, compile a structured document, and export the package your audience needs.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { label: "PDF", icon: Download },
              { label: "Word", icon: FileText },
              { label: "Excel annex", icon: FileSpreadsheet },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-lg border border-border bg-bg-offwhite p-4">
                  <Icon className="mb-3 h-5 w-5 text-brand-deep" />
                  <p className="text-sm font-semibold">{item.label}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-bg-offwhite p-4">
          <div className="rounded-lg border border-border bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Management report</p>
                <p className="text-xs text-grey-muted">Blueprint approved · 8 sections</p>
              </div>
              <span className="rounded-md bg-brand-tint-100 px-2 py-1 text-xs font-medium text-brand-deep">Ready</span>
            </div>
            <div className="space-y-3">
              {["Executive summary", "Performance analysis", "Risks and recommendations"].map((section, index) => (
                <div key={section} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{section}</p>
                    <span className="text-xs text-grey-muted">{index + 1}</span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <span className="block h-2 rounded bg-bg-light" />
                    <span className="block h-2 w-10/12 rounded bg-bg-light" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="border-y border-border bg-text-primary text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-3 lg:px-8">
          <div className="lg:col-span-1">
            <p className="text-sm font-bold uppercase text-brand-light">Security</p>
            <h2 className="mt-2 text-3xl font-bold">AI analysis with guardrails.</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">
              The system calculates values. AI turns validated outputs into clearer language and keeps source references close.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
            {[
              { icon: LockKeyhole, title: "Permissions", text: "Private, organisation, and public dashboard access patterns." },
              { icon: Users, title: "Teams", text: "Organisation setup and sharing for collaborative analytics." },
              { icon: ShieldCheck, title: "Auditability", text: "Source snapshots and generation logs for report outputs." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-lg border border-white/10 bg-white/5 p-5">
                  <Icon className="mb-4 h-5 w-5 text-brand-light" />
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-brand-tint-100 p-8 text-center sm:p-12">
          <h2 className="text-3xl font-bold text-text-primary">Start with the data you already have.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-grey-body">
            Build workbooks, publish dashboards, and generate report-ready exports from a single analytics workspace.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/signup">
              <Button size="lg" className="w-full sm:w-auto">Create account</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="w-full border-brand-tint-400 bg-white sm:w-auto">Sign in</Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-grey-body sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Logo />
          <p>AI analytics dashboards and reports for modern teams.</p>
        </div>
      </footer>
    </main>
  );
}
