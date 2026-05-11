import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function PublicTemplatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-bg-offwhite text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Supercoolstuff home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
              <BarChart3 className="h-4 w-4" />
            </span>
            <span className="font-bold">Supercoolstuff</span>
          </Link>

          <nav className="flex items-center gap-2">
            <Link href="/home" className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline">
              Open app
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</Link>
            <Link href="/signup" className={buttonVariants({ size: "sm" })}>Sign up</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
