export interface Collaborator {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  cursor: { x: number; y: number } | null;
  editingBlockId: string | null;
}

const COLORS = ["#16a34a", "#2563eb", "#9333ea", "#dc2626", "#ea580c", "#0891b2", "#be123c", "#4f46e5"];

export function collaboratorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}
