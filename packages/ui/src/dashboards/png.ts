/**
 * Snímek části stránky do PNG bez knihoven: prvek se zkopíruje i s vypočtenými styly do SVG `foreignObject`, vykreslí
 * se na plátno a stáhne. Funguje pro obsah bez cizích obrázků (grafy jsou SVG, tabulky text). Barvu pozadí bere
 * z aplikace, ať snímek v tmavém režimu není průhledný.
 */
function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  let css = "";
  for (let i = 0; i < cs.length; i++) {
    const p = cs.item(i);
    css += `${p}:${cs.getPropertyValue(p)};`;
  }
  (dst as HTMLElement).setAttribute("style", css);
  const a = src.children;
  const b = dst.children;
  for (let i = 0; i < a.length; i++) if (b[i]) inlineStyles(a[i]!, b[i]!);
}

/** Uloží prvek stránky jako obrázek PNG (stažení souboru). */
export async function elementToPng(el: HTMLElement, fileName: string, scale = 2): Promise<void> {
  const rect = el.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(el.scrollHeight);
  const clone = el.cloneNode(true) as HTMLElement;
  inlineStyles(el, clone);
  // prvky, které do snímku nepatří (nabídky, rukojeti, tlačítka)
  clone.querySelectorAll("[data-png-skip]").forEach((n) => n.remove());
  const bg = getComputedStyle(document.body).backgroundColor || "#fff";
  clone.style.background = bg;
  clone.style.width = `${width}px`;
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xml}</foreignObject></svg>`;
  const img = new Image();
  img.decoding = "sync";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Prohlížeč neumí vytvořit obrázek.");
  ctx.scale(scale, scale);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("Obrázek se nepodařilo vytvořit.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
