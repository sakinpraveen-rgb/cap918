import { Injectable } from '@angular/core';
import Dexie, { type Table } from 'dexie';
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
  TableName,
} from './models';

export interface OutboxEntry {
  seq?: number;
  table: TableName;
  id: string;
  createdAt: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/**
 * Local IndexedDB database (works in the browser and inside the Capacitor WebView).
 * This is the source of truth for the UI: screens read from here, never from the network.
 */
@Injectable({ providedIn: 'root' })
export class DbService extends Dexie {
  properties!: Table<Property, string>;
  rooms!: Table<Room, string>;
  renters!: Table<RenterPublic, string>;
  renterPrivate!: Table<RenterPrivate, string>;
  payments!: Table<Payment, string>;
  complaints!: Table<Complaint, string>;
  notices!: Table<Notice, string>;
  menus!: Table<Menu, string>;
  mealSkips!: Table<MealSkip, string>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super('pg-manager');
    this.version(1).stores({
      properties: 'id',
      rooms: 'id, propertyId',
      renters: 'id, propertyId, roomId',
      renterPrivate: 'id, propertyId, inviteCode',
      payments: 'id, propertyId, renterId, month, status',
      complaints: 'id, propertyId, renterId, status, createdAt',
      notices: 'id, propertyId, createdAt',
      menus: 'id, propertyId',
      mealSkips: 'id, propertyId, renterId, date',
      outbox: '++seq, [table+id]',
      meta: 'key',
    });
  }

  tbl<T>(name: TableName): Table<T, string> {
    return (this as unknown as Record<TableName, Table<T, string>>)[name];
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  setMeta(key: string, value: unknown): Promise<string> {
    return this.meta.put({ key, value });
  }

  async wipe(): Promise<void> {
    await Promise.all(this.tables.map((t) => t.clear()));
  }
}
