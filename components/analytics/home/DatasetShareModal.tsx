"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Label }     from "@/components/ui/label";
import { Badge }     from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Globe, Lock, Users, UserPlus, Trash2, Loader2, AlertCircle, Check,
} from "lucide-react";
import type { DatasetVisibility, DatasetShare, DatasetSharePermission } from "@/types";

// ── Visibility picker ──────────────────────────────────────────────

const VISIBILITY_CONFIG: Record<DatasetVisibility, {
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
}> = {
  private: {
    icon:        Lock,
    label:       "Private",
    description: "Only you can access this dataset.",
    color:       "text-muted-foreground",
  },
  org: {
    icon:        Users,
    label:       "Organisation",
    description: "Everyone in your organisation can query this dataset.",
    color:       "text-brand-deep",
  },
  public: {
    icon:        Globe,
    label:       "Public",
    description: "Anyone with the dashboard link can query this dataset.",
    color:       "text-status-info",
  },
};

function VisibilityOption({
  value, current, onSelect, disabled,
}: {
  value: DatasetVisibility;
  current: DatasetVisibility;
  onSelect: (v: DatasetVisibility) => void;
  disabled?: boolean;
}) {
  const cfg  = VISIBILITY_CONFIG[value];
  const Icon = cfg.icon;
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => !disabled && onSelect(value)}
      disabled={disabled}
      className={`flex items-start gap-3 w-full rounded-lg border p-3 text-left transition-all
        ${active ? "border-brand bg-brand-tint-100" : "border-border hover:border-brand/40 hover:bg-muted/50"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${active ? "text-brand" : cfg.color}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${active ? "text-brand-deep" : "text-foreground"}`}>
          {cfg.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
      </div>
      {active && <Check className="h-4 w-4 text-brand shrink-0 mt-0.5" />}
    </button>
  );
}

// ── Share row ──────────────────────────────────────────────────────

function ShareRow({
  share,
  onRevoke,
}: {
  share: DatasetShare;
  onRevoke: (id: string) => void;
}) {
  const [removing, setRemoving] = useState(false);

  async function handleRevoke() {
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/datasets/${share.datasetId}/shares/${share.id}`,
        { method: "DELETE" },
      );
      if (res.ok || res.status === 204) onRevoke(share.id);
    } finally {
      setRemoving(false);
    }
  }

  const label = share.displayName ?? share.sharedWithEmail;

  return (
    <div className="flex items-center gap-2.5 py-2 border-b last:border-0">
      <div className="h-7 w-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
        <span className="text-xs font-semibold text-brand-deep">
          {label[0]?.toUpperCase() ?? "?"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {share.displayName && (
          <p className="text-xs text-muted-foreground truncate">{share.sharedWithEmail}</p>
        )}
      </div>
      <Badge variant="secondary" className="text-xs capitalize shrink-0">
        {share.permission}
      </Badge>
      <Button
        variant="ghost" size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
        onClick={handleRevoke} disabled={removing}
      >
        {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
      </Button>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────

interface DatasetShareModalProps {
  open: boolean;
  onClose: () => void;
  datasetId: string;
  datasetName: string;
  initialVisibility: DatasetVisibility;
  hasOrg: boolean;
}

export function DatasetShareModal({
  open, onClose, datasetId, datasetName, initialVisibility, hasOrg,
}: DatasetShareModalProps) {
  const [visibility, setVisibility]   = useState<DatasetVisibility>(initialVisibility);
  const [shares, setShares]           = useState<DatasetShare[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [visChanging, setVisChanging]  = useState(false);

  const [inviteEmail, setInviteEmail]       = useState("");
  const [invitePerm, setInvitePerm]         = useState<DatasetSharePermission>("viewer");
  const [inviteSaving, setInviteSaving]     = useState(false);
  const [inviteError, setInviteError]       = useState<string | null>(null);

  // Load existing shares when modal opens
  useEffect(() => {
    if (!open) return;
    setSharesLoading(true);
    fetch(`/api/datasets/${datasetId}/shares`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setShares(data as DatasetShare[]);
      })
      .finally(() => setSharesLoading(false));
  }, [open, datasetId]);

  async function handleVisibilityChange(v: DatasetVisibility) {
    if (v === visibility) return;
    setVisChanging(true);
    try {
      const res = await fetch(`/api/datasets/${datasetId}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: v }),
      });
      if (res.ok) setVisibility(v);
    } finally {
      setVisChanging(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteSaving(true);
    setInviteError(null);
    try {
      const res  = await fetch(`/api/datasets/${datasetId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, permission: invitePerm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to share");
      setShares((prev) => [...prev, data as DatasetShare]);
      setInviteEmail("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setInviteSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Share &ldquo;{datasetName}&rdquo;
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Visibility */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Access level</Label>
            <div className="space-y-2">
              <VisibilityOption
                value="private" current={visibility}
                onSelect={handleVisibilityChange} disabled={visChanging}
              />
              <VisibilityOption
                value="org" current={visibility}
                onSelect={hasOrg ? handleVisibilityChange : () => {}}
                disabled={visChanging || !hasOrg}
              />
              {!hasOrg && (
                <p className="text-xs text-muted-foreground pl-1">
                  Create an organisation first to enable org-level sharing.
                </p>
              )}
              <VisibilityOption
                value="public" current={visibility}
                onSelect={handleVisibilityChange} disabled={visChanging}
              />
            </div>
          </div>

          {/* Specific shares */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Share with specific people</Label>
            <form onSubmit={handleInvite} className="flex gap-2">
              <Input
                type="email"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); }}
                className="flex-1"
                required
              />
              <Select value={invitePerm} onValueChange={(v) => setInvitePerm(v as DatasetSharePermission)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" size="icon" disabled={inviteSaving || !inviteEmail.trim()}>
                {inviteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </form>
            {inviteError && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3 shrink-0" />{inviteError}
              </p>
            )}
          </div>

          {/* Existing shares list */}
          {sharesLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : shares.length > 0 ? (
            <div className="border rounded-xl bg-white px-3">
              {shares.map((s) => (
                <ShareRow
                  key={s.id}
                  share={s}
                  onRevoke={(id) => setShares((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              No individual shares yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
