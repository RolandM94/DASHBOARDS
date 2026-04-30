"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Custom fallback. Receives reset() callback. */
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback(this.reset);

      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] p-8 text-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-sm text-slate-800">Something went wrong</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
              {this.state.message}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={this.reset} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
