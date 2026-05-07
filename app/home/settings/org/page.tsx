"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2, UserPlus, Trash2, Crown, ShieldCheck, User, Eye,
  CheckCircle2, Clock, Loader2, AlertCircle,
} from "lucide-react";
import type { Organization, OrgMember, OrgRole } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────

const ROLE_ICONS: Record<OrgRole, React.ElementType> = {
  owner:  Crown,
  admin:  ShieldCheck,
  member: User,
  editor: User,
  viewer: Eye,
};

function RoleBadge({ role }: { role: OrgRole }) {
  const Icon = ROLE_ICONS[role];
  const colours: Record<OrgRole, string> = {
    owner:  "bg-amber-50 text-amber-700 border-amber-200",
    admin:  "bg-brand-tint-100 text-brand-deep border-brand/20",
    member: "bg-muted text-foreground border-border",
    editor: "bg-muted text-foreground border-border",
    viewer: "bg-muted text-muted-foreground border-border",
  };
  const labels: Record<OrgRole, string> = { owner: "Owner", admin: "Admin", member: "Editor", editor: "Editor", viewer: "Viewer" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${colours[role]}`}>
      <Icon className="h-3 w-3" />
      {labels[role]}
    </span>
  );
}

// ── Create-org form ────────────────────────────────────────────────

function CreateOrgForm({ onCreated }: { onCreated: (org: Organization) => void }) {
  const [name, setName]     = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      onCreated({ id: data.id, name: data.name, slug: data.slug, ownerId: data.owner_id, createdAt: data.created_at });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-6">
      <div className="h-14 w-14 mx-auto rounded-2xl bg-brand/10 flex items-center justify-center">
        <Building2 className="h-7 w-7 text-brand" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Set up Stakeholder Management</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create an organisation to invite stakeholders and manage their access.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="text-left space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="org-name">Organisation name</Label>
          <Input
            id="org-name"
            placeholder="Acme Corp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={saving || !name.trim()}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create organisation
        </Button>
      </form>
    </div>
  );
}

// ── Invite form ────────────────────────────────────────────────────

function InviteForm({ orgId, onInvited }: { orgId: string; onInvited: (m: OrgMember) => void }) {
  const [email, setEmail]   = useState("");
  const [role, setRole]     = useState<OrgRole>("editor");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch(`/api/orgs/${orgId}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to invite");
      onInvited({
        id: data.id, orgId: data.org_id, userId: data.user_id,
        email: data.email, role: data.role, status: data.status,
        invitedBy: data.invited_by, invitedAt: data.invited_at,
      });
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          placeholder="colleague@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          className="flex-1"
          required
        />
        <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={saving || !email.trim()} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Invite
        </Button>
      </form>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

// ── Member row ─────────────────────────────────────────────────────

function MemberRow({
  member, isCurrentUser, isOrgOwner, canEdit, orgId, onRoleChange, onRemove,
}: {
  member: OrgMember;
  isCurrentUser: boolean;
  isOrgOwner: boolean;
  canEdit: boolean;
  orgId: string;
  onRoleChange: (id: string, role: OrgRole) => void;
  onRemove: (id: string) => void;
}) {
  const [changing, setChanging] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRoleChange(newRole: OrgRole) {
    if (newRole === member.role) return;
    setChanging(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) onRoleChange(member.id, newRole);
    } finally {
      setChanging(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members/${member.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) onRemove(member.id);
    } finally {
      setRemoving(false);
    }
  }

  const initials = (member.displayName ?? member.email)
    .split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-0">
      <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
        <span className="text-xs font-semibold text-brand-deep">{initials || "?"}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">
            {member.displayName ?? member.email}
            {isCurrentUser && <span className="text-muted-foreground font-normal"> (you)</span>}
          </p>
          {member.status === "active"
            ? <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0" />
            : <Clock        className="h-3.5 w-3.5 text-status-warning shrink-0" />
          }
        </div>
        {member.displayName && (
          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
        )}
        {member.status === "pending" && (
          <p className="text-[11px] text-status-warning">Invite pending</p>
        )}
      </div>
      <div className="shrink-0">
        {canEdit && !isOrgOwner ? (
          <Select value={member.role} onValueChange={(v) => handleRoleChange(v as OrgRole)} disabled={changing}>
            <SelectTrigger className="h-7 text-xs w-24 gap-1">
              {changing ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </div>
      {(canEdit || isCurrentUser) && !isOrgOwner && (
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
          onClick={handleRemove} disabled={removing}
          title={isCurrentUser ? "Leave organisation" : "Remove member"}
        >
          {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────

export default function OrgSettingsPage() {
  const [org, setOrg]         = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole]   = useState<OrgRole>("member");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const loadOrg = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/orgs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (!data.org) { setOrg(null); setMembers([]); return; }

      const loadedOrg: Organization = {
        id: data.org.id, name: data.org.name, slug: data.org.slug,
        ownerId: data.org.owner_id, createdAt: data.org.created_at,
      };
      setOrg(loadedOrg);
      if (data.membership) setMyRole(data.membership.role);

      const membersRes  = await fetch(`/api/orgs/${data.org.id}/members`);
      const membersData = await membersRes.json();
      if (membersRes.ok) {
        setMembers(membersData as OrgMember[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  // Get current user's ID from Supabase client
  useEffect(() => {
    import("@/lib/supabase/client").then(({ createClient }) => {
      const sb = createClient();
      sb.auth.getUser().then(({ data }) => {
        if (data.user) setMyUserId(data.user.id);
      });
    });
    void loadOrg();
  }, [loadOrg]);

  const canEdit = myRole === "owner" || myRole === "admin";

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex-1 overflow-auto">
        <CreateOrgForm onCreated={(newOrg) => { setOrg(newOrg); setMyRole("owner"); void loadOrg(); }} />
      </div>
    );
  }

  const activeCount  = members.filter((m) => m.status === "active").length;
  const pendingCount = members.filter((m) => m.status === "pending").length;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-brand" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{org.name}</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount} member{activeCount !== 1 ? "s" : ""}
              {pendingCount > 0 && ` · ${pendingCount} pending`}
            </p>
          </div>
          <RoleBadge role={myRole} />
        </div>

        {/* Invite (admin+) */}
        {canEdit && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Invite a stakeholder</Label>
            <InviteForm
              orgId={org.id}
              onInvited={(m) => setMembers((prev) => [...prev, m])}
            />
          </div>
        )}

        {/* Members list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Members</Label>
            <Badge variant="secondary" className="text-xs">{members.length}</Badge>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border-2 border-dashed rounded-xl">
              No stakeholders yet — invite your first one above.
            </p>
          ) : (
            <div className="border rounded-xl bg-white px-3">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isCurrentUser={m.userId === myUserId}
                  isOrgOwner={m.userId === org.ownerId}
                  canEdit={canEdit}
                  orgId={org.id}
                  onRoleChange={(id, role) =>
                    setMembers((prev) => prev.map((x) => x.id === id ? { ...x, role } : x))
                  }
                  onRemove={(id) =>
                    setMembers((prev) => prev.filter((x) => x.id !== id))
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
