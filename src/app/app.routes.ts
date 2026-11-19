import type { Routes } from '@angular/router';
import { guestGuard, roleGuard } from './core/guards';

/**
 * Route map. Every page is lazy-loaded (loadComponent), so the app starts fast and scales by feature.
 * Owner and renter each get their own tab shell; shared pages sit at the top level.
 */
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'invite/:code', // deep-link entry point
    loadComponent: () => import('./pages/auth/invite.page').then((m) => m.InvitePage),
  },

  {
    path: 'owner',
    canActivate: [roleGuard('owner')],
    loadComponent: () => import('./pages/owner/owner-tabs.page').then((m) => m.OwnerTabsPage),
    children: [
      { path: '', redirectTo: 'dues', pathMatch: 'full' },
      { path: 'dues', loadComponent: () => import('./pages/owner/dues.page').then((m) => m.DuesPage) },
      {
        path: 'complaints',
        loadComponent: () => import('./pages/owner/owner-complaints.page').then((m) => m.OwnerComplaintsPage),
      },
      { path: 'renters', loadComponent: () => import('./pages/owner/renters.page').then((m) => m.RentersPage) },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/shared/notifications.page').then((m) => m.NotificationsPage),
      },
      { path: 'more', loadComponent: () => import('./pages/owner/owner-more.page').then((m) => m.OwnerMorePage) },
    ],
  },
  {
    path: 'owner/renter/:id',
    canActivate: [roleGuard('owner')],
    loadComponent: () => import('./pages/owner/renter-detail.page').then((m) => m.RenterDetailPage),
  },
  {
    path: 'owner/add-renter',
    canActivate: [roleGuard('owner')],
    loadComponent: () => import('./pages/owner/add-renter.page').then((m) => m.AddRenterPage),
  },
  {
    path: 'owner/rooms',
    canActivate: [roleGuard('owner')],
    loadComponent: () => import('./pages/owner/rooms.page').then((m) => m.RoomsPage),
  },
  {
    path: 'owner/property',
    canActivate: [roleGuard('owner')],
    loadComponent: () => import('./pages/owner/property.page').then((m) => m.PropertyPage),
  },

  {
    path: 'renter',
    canActivate: [roleGuard('renter')],
    loadComponent: () => import('./pages/renter/renter-tabs.page').then((m) => m.RenterTabsPage),
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', loadComponent: () => import('./pages/renter/renter-home.page').then((m) => m.RenterHomePage) },
      { path: 'mess', loadComponent: () => import('./pages/renter/mess.page').then((m) => m.MessPage) },
      {
        path: 'complaints',
        loadComponent: () => import('./pages/renter/renter-complaints.page').then((m) => m.RenterComplaintsPage),
      },
      { path: 'roommates', loadComponent: () => import('./pages/renter/roommates.page').then((m) => m.RoommatesPage) },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/shared/notifications.page').then((m) => m.NotificationsPage),
      },
    ],
  },
  {
    path: 'renter/new-complaint',
    canActivate: [roleGuard('renter')],
    loadComponent: () => import('./pages/renter/new-complaint.page').then((m) => m.NewComplaintPage),
  },
  {
    path: 'renter/pay',
    canActivate: [roleGuard('renter')],
    loadComponent: () => import('./pages/renter/pay.page').then((m) => m.PayPage),
  },

  {
    path: 'complaint/:id',
    canActivate: [roleGuard('any')],
    loadComponent: () => import('./pages/shared/complaint-detail.page').then((m) => m.ComplaintDetailPage),
  },
  {
    path: 'payment/:id', // opened from a notification (in-app or phone)
    canActivate: [roleGuard('any')],
    loadComponent: () => import('./pages/shared/payment.page').then((m) => m.PaymentPage),
  },
  {
    path: 'receipt/:id',
    canActivate: [roleGuard('any')],
    loadComponent: () => import('./pages/shared/receipt.page').then((m) => m.ReceiptPage),
  },
  {
    path: 'notices',
    canActivate: [roleGuard('any')],
    loadComponent: () => import('./pages/shared/notices.page').then((m) => m.NoticesPage),
  },
  {
    path: 'settings',
    canActivate: [roleGuard('any')],
    loadComponent: () => import('./pages/shared/settings.page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'login' },
];
