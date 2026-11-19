/** Everything printed on a receipt. */
export interface ReceiptInfo {
  receiptNo: string;
  pgName: string;
  pgAddress: string;
  renterName: string;
  roomNumber: string;
  period: string; // "November 2026"
  amount: number;
  method: 'upi' | 'cash';
  utr: string | null;
  paidOn: string; // ISO
  approvedOn: string | null; // ISO
  proofPhoto: string | null; // data URL of the payment screenshot
}

const W = 1080; // px, a good width for WhatsApp / gallery
const PAD = 64;
const BLUE = '#0054e9';
const INK = '#1b1b1f';
const MUTED = '#5f6368';
const LINE = '#dadce0';
const FONT = `"Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif`;

/**
 * Draws the rent receipt (and the payment screenshot, if any) onto a canvas and returns a PNG data URL.
 * Used for "Share image" / "Download": the file the renter keeps for HRA looks like a real receipt.
 */
export async function renderReceiptPng(r: ReceiptInfo): Promise<string> {
  const proof = r.proofPhoto ? await loadImage(r.proofPhoto).catch(() => null) : null;

  // Proof is scaled to the content width, capped in height so the receipt stays readable.
  const contentW = W - PAD * 2;
  let proofW = 0;
  let proofH = 0;
  if (proof) {
    const scale = Math.min(contentW / proof.width, 1100 / proof.height, 1.5);
    proofW = Math.round(proof.width * scale);
    proofH = Math.round(proof.height * scale);
  }

  // Measure first (address can wrap), then draw.
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `30px ${FONT}`;
  const addressLines = wrap(measure, `${r.pgName}, ${r.pgAddress}`, contentW - 300);

  const rows: Array<[string, string]> = [
    ['Received from', r.renterName],
    ['Room', r.roomNumber],
    ['Period', r.period],
    ['Payment mode', r.method === 'upi' ? 'UPI' : 'Cash'],
    ...(r.utr ? ([['UPI reference (UTR)', r.utr]] as Array<[string, string]>) : []),
    ['Paid on', fmtDate(r.paidOn)],
    ...(r.approvedOn ? ([['Approved on', fmtDate(r.approvedOn)]] as Array<[string, string]>) : []),
  ];

  const headerH = 230;
  const amountH = 200;
  const rowsH = rows.length * 64 + addressLines.length * 40 + 40;
  const proofBlockH = proof ? 90 + proofH + 40 : 0;
  const footerH = 150;
  const H = headerH + amountH + rowsH + proofBlockH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;

  // background + header band
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, W, H);
  c.fillStyle = BLUE;
  c.fillRect(0, 0, W, headerH);
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.font = `bold 58px ${FONT}`;
  c.fillText('RENT RECEIPT', W / 2, 105);
  c.font = `32px ${FONT}`;
  c.fillText(r.pgName, W / 2, 160);
  c.font = `26px ${FONT}`;
  c.globalAlpha = 0.85;
  c.fillText(r.receiptNo, W / 2, 202);
  c.globalAlpha = 1;

  // amount + PAID stamp
  let y = headerH + 110;
  c.textAlign = 'left';
  c.fillStyle = MUTED;
  c.font = `28px ${FONT}`;
  c.fillText('Amount received', PAD, y - 50);
  c.fillStyle = INK;
  c.font = `bold 84px ${FONT}`;
  c.fillText('₹' + r.amount.toLocaleString('en-IN'), PAD, y + 40);
  stamp(c, W - PAD - 150, y + 5, 'PAID');
  y += amountH - 60;
  hr(c, y);

  // detail rows
  y += 60;
  const label = (t: string) => {
    c.fillStyle = MUTED;
    c.font = `28px ${FONT}`;
    c.textAlign = 'left';
    c.fillText(t, PAD, y);
  };
  for (const [k, v] of rows) {
    label(k);
    c.fillStyle = INK;
    c.font = `600 30px ${FONT}`;
    c.textAlign = 'right';
    c.fillText(v, W - PAD, y);
    y += 64;
  }
  label('Premises');
  c.fillStyle = INK;
  c.font = `30px ${FONT}`;
  c.textAlign = 'right';
  for (const line of addressLines) {
    c.fillText(line, W - PAD, y);
    y += 40;
  }
  y += 20;

  // payment proof
  if (proof) {
    hr(c, y);
    y += 60;
    c.textAlign = 'left';
    c.fillStyle = INK;
    c.font = `bold 32px ${FONT}`;
    c.fillText('Payment proof', PAD, y);
    y += 30;
    const x = (W - proofW) / 2;
    c.fillStyle = '#f1f3f4';
    c.fillRect(PAD, y, contentW, proofH);
    c.drawImage(proof, x, y, proofW, proofH);
    c.strokeStyle = LINE;
    c.lineWidth = 2;
    c.strokeRect(PAD, y, contentW, proofH);
    y += proofH + 40;
  }

  // footer
  hr(c, y);
  c.textAlign = 'center';
  c.fillStyle = MUTED;
  c.font = `26px ${FONT}`;
  c.fillText('Received with thanks. Confirmed digitally by the owner via PG Manager.', W / 2, y + 60);
  c.font = `22px ${FONT}`;
  c.fillText(`Generated ${fmtDate(new Date().toISOString())}`, W / 2, y + 100);

  return canvas.toDataURL('image/png');
}

function stamp(c: CanvasRenderingContext2D, cx: number, cy: number, text: string): void {
  c.save();
  c.translate(cx, cy);
  c.rotate(-0.18);
  c.strokeStyle = '#1e8e3e';
  c.fillStyle = '#1e8e3e';
  c.lineWidth = 6;
  c.beginPath();
  c.roundRect(-130, -55, 260, 100, 16);
  c.stroke();
  c.font = `bold 62px ${FONT}`;
  c.textAlign = 'center';
  c.fillText(text, 0, 18);
  c.restore();
}

function hr(c: CanvasRenderingContext2D, y: number): void {
  c.strokeStyle = LINE;
  c.lineWidth = 2;
  c.setLineDash([10, 8]);
  c.beginPath();
  c.moveTo(PAD, y);
  c.lineTo(W - PAD, y);
  c.stroke();
  c.setLineDash([]);
}

function wrap(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (c.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** "data:image/png;base64,AAAA" → "AAAA" (Capacitor Filesystem wants raw base64). */
export function dataUrlBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
