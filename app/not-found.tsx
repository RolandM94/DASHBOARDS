import Link from "next/link";
import { BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <div className="flex items-center justify-center gap-2.5 mb-10">
        <div className="h-9 w-9 bg-brand rounded-xl flex items-center justify-center">
          <BarChart2 className="h-5 w-5 text-white" />
        </div>
        <span className="font-bold text-lg">Supercoolstuff</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 max-w-md w-full"
        style={{ boxShadow: "0px 0px 5px 0px rgba(0,0,0,.02), 0px 2px 10px 0px rgba(0,0,0,.06), 0px 0px 1px 0px rgba(0,0,0,.3)" }}
      >
        <p className="text-6xl font-black text-brand/20 mb-4">404</p>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/home">
          <Button className="gap-2">
            <BarChart2 className="h-4 w-4" />
            Go to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
