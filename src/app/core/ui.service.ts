import { Injectable, inject } from '@angular/core';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';

/** Small helpers around Ionic overlay controllers and Capacitor device features. */
@Injectable({ providedIn: 'root' })
export class UiService {
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);
  private readonly sheetCtrl = inject(ActionSheetController);

  async toast(message: string, color: 'success' | 'danger' | 'medium' = 'success'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2200, color, position: 'bottom' });
    await t.present();
  }

  async confirm(header: string, message: string, okText = 'OK'): Promise<boolean> {
    const a = await this.alertCtrl.create({
      header,
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: okText, role: 'confirm' },
      ],
    });
    await a.present();
    return (await a.onDidDismiss()).role === 'confirm';
  }

  /**
   * Take or pick a photo, downscaled so it syncs quickly. Returns a data URL, or null if cancelled.
   * The camera/gallery choice uses our own Ionic action sheet. (The plugin's built-in prompt needs
   * the separate @ionic/pwa-elements package in the browser; without it the button silently did nothing.)
   */
  async photo(header = 'Add a photo'): Promise<string | null> {
    const sheet = await this.sheetCtrl.create({
      header,
      buttons: [
        { text: 'Take photo', icon: 'camera-outline', data: CameraSource.Camera },
        { text: 'Choose from gallery', icon: 'image-outline', data: CameraSource.Photos },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data: source, role } = await sheet.onDidDismiss<CameraSource>();
    if (role === 'cancel' || role === 'backdrop' || !source) return null;

    try {
      const p = await Camera.getPhoto({
        source,
        resultType: CameraResultType.DataUrl,
        quality: 50,
        width: 900,
        correctOrientation: true,
        // In the browser always use a file picker; on a phone browser it also offers the camera.
        webUseInput: !Capacitor.isNativePlatform(),
      });
      return p.dataUrl ?? null;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (!/cancel/i.test(msg)) {
        await this.toast(/denied|permission/i.test(msg) ? 'Allow camera/photos access in Settings to add a photo.' : 'Could not get the photo. Please try again.', 'danger');
      }
      return null;
    }
  }

  async share(title: string, text: string, url?: string): Promise<void> {
    try {
      await Share.share({ title, text, url, dialogTitle: title });
    } catch {
      await navigator.clipboard?.writeText(url ? `${text}\n${url}` : text);
      await this.toast('Copied to clipboard', 'medium');
    }
  }
}
