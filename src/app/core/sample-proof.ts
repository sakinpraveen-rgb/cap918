/**
 * DEMO MODE ONLY: draws a simple, clearly-watermarked "SAMPLE" UPI confirmation image so the sample
 * payments have a screenshot to look at. Real payments always use the image the renter attaches.
 */
export function sampleProofImage(amount: number, payee: string, utr: string, when: Date): string {
  const W = 540;
  const H = 960;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  if (!c) return '';
  const FONT = `"Segoe UI", Roboto, Arial, sans-serif`;

  c.fillStyle = '#f6f8fc';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#1a73e8';
  c.fillRect(0, 0, W, 90);
  c.fillStyle = '#fff';
  c.font = `600 30px ${FONT}`;
  c.textAlign = 'center';
  c.fillText('UPI Payment', W / 2, 58);

  // green tick
  c.fillStyle = '#1e8e3e';
  c.beginPath();
  c.arc(W / 2, 220, 70, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#fff';
  c.lineWidth = 14;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(W / 2 - 32, 222);
  c.lineTo(W / 2 - 8, 248);
  c.lineTo(W / 2 + 36, 196);
  c.stroke();

  c.fillStyle = '#202124';
  c.font = `600 30px ${FONT}`;
  c.fillText('Payment successful', W / 2, 345);
  c.font = `bold 64px ${FONT}`;
  c.fillText('₹' + amount.toLocaleString('en-IN'), W / 2, 435);

  const rows: Array<[string, string]> = [
    ['To', payee],
    ['UPI ref no.', utr],
    ['Date', when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })],
    ['Time', when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })],
  ];
  let y = 530;
  for (const [k, v] of rows) {
    c.textAlign = 'left';
    c.fillStyle = '#5f6368';
    c.font = `24px ${FONT}`;
    c.fillText(k, 48, y);
    c.textAlign = 'right';
    c.fillStyle = '#202124';
    c.font = `600 24px ${FONT}`;
    c.fillText(v, W - 48, y);
    y += 56;
  }

  // watermark so it can never pass as a real screenshot
  c.save();
  c.translate(W / 2, H / 2 + 60);
  c.rotate(-0.5);
  c.fillStyle = 'rgba(217, 48, 37, 0.22)';
  c.font = `bold 120px ${FONT}`;
  c.textAlign = 'center';
  c.fillText('SAMPLE', 0, 0);
  c.restore();
  c.fillStyle = '#d93025';
  c.font = `600 20px ${FONT}`;
  c.textAlign = 'center';
  c.fillText('Demo data, not a real payment', W / 2, H - 40);

  return canvas.toDataURL('image/jpeg', 0.7);
}
