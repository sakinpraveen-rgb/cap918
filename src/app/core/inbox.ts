import type { AppNotification, Payment, RenterPublic, Role, Room } from './models';

/**
 * Builds the notification list from payment records (pure function, unit-tested).
 *
 * Why derived instead of stored: the payment row already carries everything both sides need
 * (who, how much, proof, status, decision time, reason). Deriving means the owner's and renter's
 * notifications can never disagree with the payment itself, they work offline, and they sync for free
 * through the normal record merge. Only "which ones have I read" is kept per user, on the device.
 *
 *  Owner sees:   a renter submitted a UPI payment            → "payment_submitted" (action needed while pending)
 *  Renter sees:  owner approved / rejected my payment         → "payment_approved" / "payment_rejected"
 *                owner recorded a cash payment for me         → "cash_recorded"
 */
export function buildNotifications(
  role: Role,
  myRenterId: string | null,
  payments: Payment[],
  renters: RenterPublic[],
  rooms: Room[],
  readIds: ReadonlySet<string>,
): AppNotification[] {
  const out: AppNotification[] = [];
  const rupees = (n: number) => '₹' + n.toLocaleString('en-IN');
  const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  for (const p of payments) {
    if (p.deleted) continue;

    if (role === 'owner') {
      if (p.createdBy !== 'renter') continue;
      const r = renters.find((x) => x.id === p.renterId);
      const room = rooms.find((x) => x.id === r?.roomId);
      const who = r ? `${r.name} (Room ${room?.number ?? '?'})` : 'A former renter';
      const pending = p.status === 'pending';
      const id = `sub:${p.id}`;
      out.push({
        id,
        kind: 'payment_submitted',
        at: p.createdAt,
        title: `${r?.name ?? 'Renter'} paid ${rupees(p.amount)}`,
        body: pending
          ? `${who} · ${monthName(p.month)} · ${p.proofPhoto ? 'screenshot attached' : 'UTR ' + (p.utr ?? '–')}. Tap to review.`
          : `${who} · ${monthName(p.month)} · ${p.status === 'confirmed' ? 'approved' : 'rejected'}`,
        paymentId: p.id,
        amount: p.amount,
        photo: p.proofPhoto ?? null,
        actionNeeded: pending,
        // Once decided, the owner has already dealt with it, so it no longer counts as unread.
        read: !pending || readIds.has(id),
      });
    } else {
      if (p.renterId !== myRenterId) continue;
      if (p.createdBy === 'owner' && p.method === 'cash' && p.status === 'confirmed') {
        const id = `cash:${p.id}`;
        out.push({
          id,
          kind: 'cash_recorded',
          at: p.decidedAt ?? p.createdAt,
          title: `Cash payment of ${rupees(p.amount)} recorded`,
          body: `Your owner recorded cash for ${monthName(p.month)}. Receipt ${p.receiptNo ?? ''} is ready.`,
          paymentId: p.id,
          amount: p.amount,
          photo: p.proofPhoto ?? null,
          actionNeeded: false,
          read: readIds.has(id),
        });
        continue;
      }
      if (!p.decidedAt || (p.status !== 'confirmed' && p.status !== 'rejected')) continue;
      // Id includes the status, so if the owner changes a decision the renter gets a fresh notification.
      const id = `dec:${p.id}:${p.status}`;
      const ok = p.status === 'confirmed';
      out.push({
        id,
        kind: ok ? 'payment_approved' : 'payment_rejected',
        at: p.decidedAt,
        title: ok ? `Payment of ${rupees(p.amount)} approved` : `Payment of ${rupees(p.amount)} rejected`,
        body: ok
          ? `${monthName(p.month)} rent is confirmed. Receipt ${p.receiptNo ?? ''} is ready.`
          : `Reason: ${p.rejectReason || 'not given'}. Please check and pay again.`,
        paymentId: p.id,
        amount: p.amount,
        photo: p.proofPhoto ?? null,
        actionNeeded: false,
        read: readIds.has(id),
      });
    }
  }

  // Action-needed first, then newest first.
  return out.sort((a, b) => Number(b.actionNeeded) - Number(a.actionNeeded) || b.at.localeCompare(a.at));
}

/** "2 min ago", "3 h ago", "Yesterday", "12 Nov". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  const s = Math.max(0, (now.getTime() - t.getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172_800) return 'Yesterday';
  return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
