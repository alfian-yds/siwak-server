import type { Db } from "../db/client.js";
import { activityLogs } from "../db/schema.js";

export interface AuditEntry {
  userId?: string | null;
  mosqueId?: string | null;
  action: string; // mis. "auth.login", "settings.update"
  entity?: string;
  entityId?: string;
  diff?: unknown;
  ip?: string;
}

/** Mencatat satu baris log aktivitas (F-ADM-17). Galat pencatatan tidak menggagalkan aksi utama. */
export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      userId: entry.userId ?? null,
      mosqueId: entry.mosqueId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      diff: entry.diff ?? null,
      ip: entry.ip?.slice(0, 45),
    });
  } catch (err) {
    console.error(`Gagal mencatat log aktivitas ${entry.action}:`, err);
  }
}
