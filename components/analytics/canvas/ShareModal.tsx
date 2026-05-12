"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Permission = "editor" | "viewer";

interface CanvasShare {
  id: string;
  canvasId: string;
  sharedWithEmail: string;
  sharedWithUserId: string;
  permission: Permission;
  createdAt: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export function ShareModal({
  open,
  onClose,
  canvasId,
  canvasName,
}: {
  open: boolean;
  onClose: () => void;
  canvasId: string;
  canvasName: string;
}) {
  const [shares, setShares] = useState<CanvasShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<Permission>("editor");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/canvases/${canvasId}/shares`)
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) setShares(data as CanvasShare[]);
      })
      .finally(() => setLoading(false));
  }, [canvasId, open]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/canvases/${canvasId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, permission }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not share canvas");
      setShares((current) => [...current.filter((share) => share.sharedWithEmail !== body.sharedWithEmail), body]);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share canvas");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(shareId: string) {
    const response = await fetch(`/api/canvases/${canvasId}/shares?shareId=${encodeURIComponent(shareId)}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setShares((current) => current.filter((share) => share.id !== shareId));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand" />
            Share &ldquo;{canvasName}&rdquo;
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <form onSubmit={invite} className="space-y-2">
            <Label className="text-sm font-semibold">Invite collaborator</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="person@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                required
              />
              <Select value={permission} onValueChange={(value) => setPermission(value as Permission)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" size="icon" disabled={saving || !email.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </div>
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
          </form>

          {loading ? (
            <div className="flex justify-center py-5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : shares.length > 0 ? (
            <div className="overflow-hidden rounded-xl border bg-white">
              {shares.map((share) => (
                <div key={share.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                    {(share.displayName ?? share.sharedWithEmail).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{share.displayName ?? share.sharedWithEmail}</p>
                    <p className="truncate text-xs text-muted-foreground">{share.sharedWithEmail}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">{share.permission}</Badge>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => revoke(share.id)}
                    aria-label="Revoke share"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              No collaborators yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
