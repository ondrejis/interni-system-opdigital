"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../components/button";

/**
 * Plocha pro podpis prstem nebo myší. `onChange` dostane PNG s průhledným pozadím, nebo `null`, když je plocha prázdná.
 * Funguje s dotykem i myší (pointer events); `touch-action: none` brání posouvání stránky při kreslení.
 */
export function SignaturePad({
  onChange,
  height = 160,
}: {
  onChange: (png: Blob | null) => void;
  height?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, [height]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Plocha pro podpis"
        data-testid="signature-canvas"
        style={{ height, touchAction: "none" }}
        className="w-full cursor-crosshair rounded-md border border-line-strong bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const { x, y } = pos(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.01, y + 0.01);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const { x, y } = pos(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          setEmpty(false);
          canvas.current!.toBlob((b) => onChange(b), "image/png");
        }}
      />
      <div className="mt-1.5 flex items-center justify-between text-sm text-muted">
        <span>{empty ? "Podepište se prstem nebo myší." : "Podpis zachycen."}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            const c = canvas.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange(null);
          }}
        >
          Smazat podpis
        </Button>
      </div>
    </div>
  );
}
