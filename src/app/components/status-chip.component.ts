import { Component, computed, input } from '@angular/core';
import { NgClass } from '@angular/common';

const LABELS: Record<string, string> = {
  paid: 'Paid',
  awaiting: 'Awaiting confirmation',
  due: 'Due',
  overdue: 'Overdue',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  pending: 'Pending',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
};

/** Coloured status pill. Uses [ngClass] to pick the colour; text is always present (never colour-only). */
@Component({
  selector: 'app-status-chip',
  imports: [NgClass],
  template: `<span class="chip" [ngClass]="'chip--' + status()" role="status">{{ text() }}</span>`,
  styles: `
    .chip { display:inline-block; padding:2px 10px; border-radius:999px; font-size:0.8em; font-weight:600; white-space:nowrap; }
    .chip--paid, .chip--resolved, .chip--confirmed { background:var(--ion-color-success-tint); color:#0b3d1b; }
    .chip--awaiting, .chip--in_progress, .chip--pending { background:#ffe8a3; color:#4a3500; }
    .chip--due, .chip--open { background:#dbe7ff; color:#0b2a66; }
    .chip--overdue, .chip--rejected { background:#ffd6d6; color:#6b0000; }
  `,
})
export class StatusChipComponent {
  readonly status = input.required<string>();
  readonly text = computed(() => LABELS[this.status()] ?? this.status());
}
