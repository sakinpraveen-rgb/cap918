import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonImg,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonRow,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { RepoService } from '../../core/repo.service';
import { UiService } from '../../core/ui.service';
import { AnalyticsService } from '../../core/analytics.service';
import { COMPLAINT_CATEGORIES, type Complaint, type ComplaintCategory } from '../../core/models';

/** File a complaint: category grid (ion-grid + ngClass), title, details, optional photo (Capacitor Camera). */
@Component({
  selector: 'app-new-complaint',
  imports: [
    FormsModule, NgClass,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonGrid, IonRow, IonCol, IonIcon, IonList, IonItem,
    IonInput, IonTextarea, IonButton, IonImg, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/renter/complaints"></ion-back-button></ion-buttons>
        <ion-title>New complaint</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <p class="ion-padding-horizontal"><strong>What's the problem about?</strong></p>
      <ion-grid role="radiogroup" aria-label="Category">
        <ion-row>
          @for (c of categories; track c.key) {
            <ion-col size="4" size-md="3">
              <button type="button" class="cat" role="radio" [attr.aria-checked]="category() === c.key"
                [ngClass]="{ selected: category() === c.key }" (click)="category.set(c.key)">
                <ion-icon [name]="c.icon" aria-hidden="true"></ion-icon>
                <span>{{ c.label }}</span>
              </button>
            </ion-col>
          }
        </ion-row>
      </ion-grid>

      <ion-list inset>
        <ion-item><ion-input label="Short title" labelPlacement="stacked" [(ngModel)]="title" maxlength="80" placeholder="e.g. Geyser not working" [counter]="true"></ion-input></ion-item>
        <ion-item><ion-textarea label="Details" labelPlacement="stacked" [(ngModel)]="description" autoGrow rows="3" placeholder="Where, since when, how bad?"></ion-textarea></ion-item>
      </ion-list>
      <div class="ion-padding-horizontal">
        <ion-button fill="outline" (click)="addPhoto()">
          <ion-icon slot="start" name="camera-outline" aria-hidden="true"></ion-icon> {{ photo() ? 'Retake photo' : 'Add photo' }}
        </ion-button>
        @if (photo()) { <ion-img [src]="photo()" alt="Complaint photo preview" class="preview"></ion-img> }
        @if (category() === 'roommate') { <ion-note><p>Roommate issues are visible only to the owner.</p></ion-note> }
        <ion-button expand="block" class="ion-margin-vertical" [disabled]="!category() || title.trim().length < 3" (click)="submit()">Submit complaint</ion-button>
      </div>
    </ion-content>
  `,
  styles: `
    .cat { width:100%; min-height:84px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
      border-radius:12px; border:2px solid var(--ion-color-light-shade); background:var(--ion-background-color); color:var(--ion-text-color); font-size:.78em; padding:6px; }
    .cat ion-icon { font-size:26px; }
    .cat.selected { border-color: var(--ion-color-primary); background: var(--ion-color-primary-tint); color:#fff; }
    .cat:focus-visible { outline:3px solid var(--ion-color-primary-shade); }
    .preview { max-height:200px; margin-top:8px; }
  `,
})
export class NewComplaintPage {
  private readonly auth = inject(AuthService);
  private readonly repo = inject(RepoService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);

  readonly categories = COMPLAINT_CATEGORIES;
  readonly category = signal<ComplaintCategory | null>(null);
  readonly photo = signal<string | null>(null);
  title = '';
  description = '';

  async addPhoto(): Promise<void> {
    const p = await this.ui.photo();
    if (p) this.photo.set(p);
  }

  async submit(): Promise<void> {
    const s = this.auth.session()!;
    const c = await this.repo.save<Complaint>('complaints', {
      propertyId: s.propertyId,
      audience: 'subject', // owner + me only
      subjectUserId: s.userId,
      renterId: s.renterId!,
      category: this.category()!,
      title: this.title.trim(),
      description: this.description.trim(),
      photo: this.photo(),
      status: 'open',
      renterConfirmed: null,
      createdAt: new Date().toISOString(),
    });
    this.analytics.track('complaint_filed', { category: c.category, has_photo: !!c.photo });
    await this.ui.toast('Complaint sent to owner');
    await this.router.navigate(['/complaint', c.id], { replaceUrl: true });
  }
}
