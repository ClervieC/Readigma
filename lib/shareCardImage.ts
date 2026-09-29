import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../theme';
import { formatDuration } from './timer';
import type { ShareBookCardData } from '../components/ShareBookCard';

// Web only. Paints the share card straight onto a <canvas> instead of
// screenshotting the DOM with html2canvas (react-native-view-shot's web
// path). html2canvas clones the whole page into a hidden iframe and, on
// WebKit, waits for every image in it to load — on a real iPhone some never
// do, so the capture hung until timeout — and it also misreads modern
// WebKit computed styles (rgba text went black, fonts/margins were lost).
// Drawing it ourselves has nothing to wait on and renders the same
// everywhere. Keep the geometry below in sync with ShareBookCard's styles.

const W = 320;
const MIN_H = Math.round((W * 16) / 9);
const PAD = 22;
const STAR_PATH = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

type Labels = { kicker: string; format: Record<string, string> };

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function ensureFonts() {
  const specs = [
    `19px "${fonts.headingBold}"`,
    `13px "${fonts.body}"`,
    `11px "${fonts.bodySemiBold}"`,
    '14px feather',
  ];
  // Never let a stuck font load block the share — worst case the canvas
  // falls back to the system font.
  await Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s).catch(() => null))),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
}

function glyph(name: keyof typeof Feather.glyphMap): string {
  return String.fromCodePoint(Feather.glyphMap[name] as number);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // Canvas letterSpacing is recent (Safari 18.4+); skip it where missing.
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${px}px`;
}

// Lays the card out top to bottom. Called twice: once to measure the height
// (the card grows with long reviews, like ShareBookCard's minHeight), then
// again to paint onto a canvas of that size.
function layout(
  ctx: CanvasRenderingContext2D,
  data: ShareBookCardData,
  labels: Labels,
  cover: HTMLImageElement | null,
  paint: boolean,
): number {
  const cx = W / 2;
  const inner = W - PAD * 2;
  let y = PAD;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Kicker
  y += 6;
  ctx.font = `11px "${fonts.bodySemiBold}"`;
  setSpacing(ctx, 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  if (paint) ctx.fillText(labels.kicker.toUpperCase(), cx, y);
  setSpacing(ctx, 0);
  y += 14;

  // Cover
  y += 24;
  const cw = 128, ch = 188, cxl = cx - cw / 2;
  if (paint) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, cxl, y, cw, ch, 10);
    ctx.fillStyle = cover ? '#000' : 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, cxl, y, cw, ch, 10);
    ctx.clip();
    if (cover) {
      // cover-fit, like the <Image> default resizeMode
      const s = Math.max(cw / cover.width, ch / cover.height);
      const dw = cover.width * s, dh = cover.height * s;
      ctx.drawImage(cover, cxl + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh);
    } else {
      ctx.font = '40px feather';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(glyph('book'), cx, y + ch / 2);
      ctx.textBaseline = 'top';
    }
    ctx.restore();
  }
  y += ch;

  // Title
  y += 20;
  ctx.font = `19px "${fonts.headingBold}"`;
  ctx.fillStyle = '#FFFFFF';
  for (const line of wrap(ctx, data.title, inner - 16)) {
    if (paint) ctx.fillText(line, cx, y);
    y += 25;
  }

  // Author
  if (data.author) {
    y += 4;
    ctx.font = `13px "${fonts.body}"`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    if (paint) ctx.fillText(wrap(ctx, data.author, inner)[0], cx, y);
    y += 17;
  }

  // Stars
  if (data.rating > 0) {
    y += 10;
    const size = 20, gap = 5;
    const total = size * 5 + gap * 4;
    const path = new Path2D(STAR_PATH);
    for (let i = 0; i < 5; i++) {
      const fraction = Math.max(0, Math.min(1, data.rating - i));
      const sx = cx - total / 2 + i * (size + gap);
      if (!paint) continue;
      ctx.save();
      ctx.translate(sx, y);
      ctx.scale(size / 24, size / 24);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fill(path);
      if (fraction > 0) {
        ctx.beginPath();
        ctx.rect(0, 0, 24 * fraction, 24);
        ctx.clip();
        ctx.fillStyle = '#FFFFFF';
        ctx.fill(path);
      }
      ctx.restore();
    }
    y += size;
  }

  // Review
  if (data.comment) {
    y += 14;
    ctx.font = `italic 13px "${fonts.body}"`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const line of wrap(ctx, `“${data.comment}”`, inner - 12)) {
      if (paint) ctx.fillText(line, cx, y + 3);
      y += 19;
    }
  }

  // Reading journey (emoji + optional %), centered rows
  if (data.journey.length > 0) {
    y += 16;
    const itemW = 28, gap = 10;
    const perRow = Math.max(1, Math.floor((inner - 12 + gap) / (itemW + gap)));
    for (let r = 0; r < data.journey.length; r += perRow) {
      const row = data.journey.slice(r, r + perRow);
      const rowW = row.length * itemW + (row.length - 1) * gap;
      const hasPercent = row.some((e) => e.percent != null);
      row.forEach((entry, i) => {
        if (!paint) return;
        const ex = cx - rowW / 2 + i * (itemW + gap) + itemW / 2;
        ctx.font = '22px sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(entry.emoji, ex, y);
        if (entry.percent != null) {
          ctx.font = `10px "${fonts.bodySemiBold}"`;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(`${Math.round(entry.percent)}%`, ex, y + 30);
        }
      });
      y += hasPercent ? 44 : 28;
      if (r + perRow < data.journey.length) y += gap;
    }
  }

  // Format / reading-time chips
  const chips: { icon: keyof typeof Feather.glyphMap; label: string }[] = data.formats
    .slice(0, 3)
    .map((f) => ({
      icon: (f === 'physical' ? 'book' : f === 'ereader' ? 'tablet' : 'headphones') as keyof typeof Feather.glyphMap,
      label: labels.format[f],
    }));
  if (data.readingSeconds > 0) chips.push({ icon: 'clock', label: formatDuration(data.readingSeconds) });
  if (chips.length > 0) {
    y += 18;
    ctx.font = `11px "${fonts.bodySemiBold}"`;
    const chipH = 24, gap = 8;
    const widths = chips.map((c) => 10 + 12 + 5 + ctx.measureText(c.label).width + 10);
    // Greedy rows, like flexWrap + justifyContent: center
    const rows: number[][] = [[]];
    let rowW = 0;
    widths.forEach((w, i) => {
      const next = rowW ? rowW + gap + w : w;
      if (next > inner && rowW) { rows.push([i]); rowW = w; }
      else { rows[rows.length - 1].push(i); rowW = next; }
    });
    rows.forEach((row, ri) => {
      const total = row.reduce((s, i) => s + widths[i], 0) + gap * (row.length - 1);
      let x = cx - total / 2;
      for (const i of row) {
        if (paint) {
          roundRect(ctx, x, y, widths[i], chipH, chipH / 2);
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fill();
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '12px feather';
          ctx.fillText(glyph(chips[i].icon), x + 10, y + chipH / 2);
          ctx.font = `11px "${fonts.bodySemiBold}"`;
          ctx.fillText(chips[i].label, x + 27, y + chipH / 2 + 0.5);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
        }
        x += widths[i] + gap;
      }
      y += chipH + (ri < rows.length - 1 ? gap : 0);
    });
  }

  // Brand
  y += 22;
  ctx.font = `13px "${fonts.headingBold}"`;
  setSpacing(ctx, 0.5);
  const brandW = 14 + 6 + ctx.measureText('Readigma').width;
  if (paint) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Readigma', cx - brandW / 2 + 20, y + 9);
    setSpacing(ctx, 0);
    ctx.font = '14px feather';
    ctx.fillText(glyph('book-open'), cx - brandW / 2, y + 9);
  }
  setSpacing(ctx, 0);
  y += 18;

  return y + 26;
}

export async function renderShareCardImage(
  data: ShareBookCardData,
  colors: ColorPalette,
  labels: Labels,
): Promise<string> {
  await ensureFonts();
  const cover = data.coverUrl ? await loadImage(data.coverUrl) : null;

  const measure = document.createElement('canvas').getContext('2d')!;
  const h = Math.max(MIN_H, Math.ceil(layout(measure, data, labels, cover, false)));

  // 3x like a phone screenshot, capped so a very long review stays well under
  // iOS Safari's canvas size limit.
  const scale = Math.min(3, 4096 / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Same diagonal gradient as ShareBookCard's LinearGradient
  // (start {0.1, 0} -> end {0.9, 1}), clipped to the card's rounded corners.
  roundRect(ctx, 0, 0, W, h, 20);
  ctx.clip();
  const grad = ctx.createLinearGradient(W * 0.1, 0, W * 0.9, h);
  grad.addColorStop(0, colors.purple);
  grad.addColorStop(1, colors.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, h);

  layout(ctx, data, labels, cover, true);
  return canvas.toDataURL('image/png');
}
