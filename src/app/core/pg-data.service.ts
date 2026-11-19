import { Injectable, inject } from '@angular/core';
import { combineLatest, map, type Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { DbService } from './db.service';
import { computeDues, monthKey, type Dues } from './dues';
import type {
  Complaint,
  MealSkip,
  Menu,
  Notice,
  Payment,
  Property,
  RenterPrivate,
  RenterPublic,
  Room,
} from './models';
import { RepoService } from './repo.service';

export interface RenterRow {
  renter: RenterPublic;
  priv: RenterPrivate | undefined;
  room: Room | undefined;
  dues: Dues | null;
}

/**
 * Read-side service: live, reactive queries over the local DB for the current PG.
 * Every observable re-emits when local data changes (own writes or synced remote writes).
 */
@Injectable({ providedIn: 'root' })
export class PgDataService {
  private readonly db = inject(DbService);
  private readonly repo = inject(RepoService);
  private readonly auth = inject(AuthService);

  private get pid(): string {
    return this.auth.session()!.propertyId;
  }

  property$(): Observable<Property | undefined> {
    const pid = this.pid;
    return this.repo.live(() => this.db.properties.get(pid));
  }

  rooms$(): Observable<Room[]> {
    const pid = this.pid;
    return this.repo.live(async () =>
      (await this.db.rooms.where({ propertyId: pid }).toArray())
        .filter((r) => !r.deleted)
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    );
  }

  renters$(): Observable<RenterPublic[]> {
    const pid = this.pid;
    return this.repo.live(async () =>
      (await this.db.renters.where({ propertyId: pid }).toArray()).filter((r) => !r.deleted && r.active),
    );
  }

  privates$(): Observable<RenterPrivate[]> {
    const pid = this.pid;
    return this.repo.live(() => this.db.renterPrivate.where({ propertyId: pid }).toArray());
  }

  payments$(): Observable<Payment[]> {
    const pid = this.pid;
    return this.repo.live(async () =>
      (await this.db.payments.where({ propertyId: pid }).toArray())
        .filter((p) => !p.deleted)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  complaints$(): Observable<Complaint[]> {
    const pid = this.pid;
    return this.repo.live(async () =>
      (await this.db.complaints.where({ propertyId: pid }).toArray())
        .filter((c) => !c.deleted)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  complaint$(id: string): Observable<Complaint | undefined> {
    return this.repo.live(() => this.db.complaints.get(id));
  }

  notices$(): Observable<Notice[]> {
    const pid = this.pid;
    return this.repo.live(async () =>
      (await this.db.notices.where({ propertyId: pid }).toArray())
        .filter((n) => !n.deleted)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)),
    );
  }

  menu$(): Observable<Menu | undefined> {
    const pid = this.pid;
    return this.repo.live(() => this.db.menus.get(`menu-${pid}`));
  }

  skips$(): Observable<MealSkip[]> {
    const pid = this.pid;
    return this.repo.live(async () =>
      (await this.db.mealSkips.where({ propertyId: pid }).toArray()).filter((s) => !s.deleted),
    );
  }

  /** Everything the owner's dues list needs, joined in one stream. */
  renterRows$(month = monthKey(new Date())): Observable<RenterRow[]> {
    return combineLatest([
      this.property$(),
      this.renters$(),
      this.privates$(),
      this.rooms$(),
      this.payments$(),
      this.skips$(),
    ]).pipe(
      map(([property, renters, privates, rooms, payments, skips]) =>
        renters
          .map((renter) => {
            const priv = privates.find((p) => p.id === renter.id);
            return {
              renter,
              priv,
              room: rooms.find((r) => r.id === renter.roomId),
              dues: property && priv ? computeDues(property, priv, payments, skips, month) : null,
            };
          })
          .sort((a, b) => (a.room?.number ?? '').localeCompare(b.room?.number ?? '', undefined, { numeric: true })),
      ),
    );
  }
}
