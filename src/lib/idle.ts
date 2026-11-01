// The admin panel asks for the 2FA code again after 15 minutes without use.
export const ADMIN_IDLE_MS = 15 * 60 * 1000;
export const idleExpired = (lastActive: number | null | undefined, now: number = Date.now()): boolean => lastActive != null && now - lastActive >= ADMIN_IDLE_MS;
