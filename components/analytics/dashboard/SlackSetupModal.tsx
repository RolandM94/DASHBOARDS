"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";

export interface SlackIntegrationState {
  id: string;
  channelName?: string | null;
  active: boolean;
  webhookUrlMasked: string;
  lastSharedAt?: string | null;
}

interface SlackResponse {
  integration: SlackIntegrationState | null;
}

export function SlackSetupModal({
  dashboardId,
  open,
  onOpenChange,
  onIntegrationChange,
}: {
  dashboardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIntegrationChange: (integration: SlackIntegrationState | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [integration, setIntegration] = useState<SlackIntegrationState | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [channelName, setChannelName] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/dashboards/${dashboardId}/slack`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Could not load Slack integration");
        return body as SlackResponse;
      })
      .then(({ integration: next }) => {
        setIntegration(next);
        onIntegrationChange(next);
        setWebhookUrl("");
        setChannelName(next?.channelName ?? "");
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load Slack integration"))
      .finally(() => setLoading(false));
  }, [dashboardId, onIntegrationChange, open]);

  async function saveIntegration() {
    setSaving(true);
    try {
      const response = await fetch(`/api/dashboards/${dashboardId}/slack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl, channelName, active: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save Slack integration");
      setIntegration(body.integration);
      onIntegrationChange(body.integration);
      setWebhookUrl("");
      toast.success("Slack integration saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save Slack integration");
    } finally {
      setSaving(false);
    }
  }

  async function removeIntegration() {
    setRemoving(true);
    try {
      const response = await fetch(`/api/dashboards/${dashboardId}/slack`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not remove Slack integration");
      setIntegration(null);
      onIntegrationChange(null);
      setWebhookUrl("");
      setChannelName("");
      toast.success("Slack integration removed");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove Slack integration");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-brand" />
            Slack integration
          </DialogTitle>
          <DialogDescription>
            Add a Slack incoming webhook to share this dashboard to a channel.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Slack settings...
          </div>
        ) : (
          <div className="space-y-4">
            {integration && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Configured</Badge>
                  {integration.channelName && <span className="font-medium">{integration.channelName}</span>}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{integration.webhookUrlMasked}</p>
                {integration.lastSharedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last shared {new Date(integration.lastSharedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="slack-webhook">Webhook URL</Label>
              <Input
                id="slack-webhook"
                type="password"
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.target.value)}
                placeholder="https://hooks.slack.com/services/..."
              />
              <p className="text-xs text-muted-foreground">
                The URL is stored server-side and never returned to the browser.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slack-channel">Channel name</Label>
              <Input
                id="slack-channel"
                value={channelName}
                onChange={(event) => setChannelName(event.target.value)}
                placeholder="#team-analytics"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {integration && (
            <Button variant="outline" onClick={removeIntegration} disabled={saving || removing} className="mr-auto gap-1.5">
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || removing}>
            Cancel
          </Button>
          <Button onClick={saveIntegration} disabled={loading || saving || removing || !webhookUrl.trim()} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
