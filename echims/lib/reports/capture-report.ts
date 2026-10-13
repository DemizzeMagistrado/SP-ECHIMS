"use client";
import { toPng } from "html-to-image";
/** Captures the report itself, without application controls or table reconstruction. */
export async function captureReport(root: HTMLElement) {
  const source = root.querySelector<HTMLElement>(
    ".nutrition-report-output,.profile-report-output,.vax-report-output,.supp-report-output,.inventory-report-output",
  );
  if (!source) throw new Error("Open a saved report before downloading Excel.");
  await document.fonts.ready;
  const wrapper = document.createElement("div"),
    clone = source.cloneNode(true) as HTMLElement;
  wrapper.style.cssText =
    "position:fixed;left:-30000px;top:0;background:white;pointer-events:none;z-index:-1;";
  const width = Math.ceil(Math.max(source.getBoundingClientRect().width, 800));
  wrapper.style.width = `${width}px`;
  clone.style.width = `${width}px`;
  clone.style.position = "relative";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.backgroundColor = "white";
  const originalStyle = getComputedStyle(source);
  clone.style.color = originalStyle.color;
  clone.style.fontFamily = originalStyle.fontFamily;
  clone.style.fontSize = originalStyle.fontSize;
  clone.style.lineHeight = originalStyle.lineHeight;
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  try {
    // Hide controls only; preserve the displayed report's actual typography and spacing.
    clone
      .querySelectorAll(
        "button,.nutrition-no-print,.vax-no-print,.supp-report-no-print",
      )
      .forEach((n) =>
        (n as HTMLElement).style.setProperty("display", "none", "important"),
      );
    clone.querySelectorAll<HTMLElement>(".overflow-x-auto").forEach((n) => {
      n.style.overflow = "visible";
    });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const fullWidth = Math.ceil(Math.max(width, clone.scrollWidth)),
      height = Math.ceil(clone.scrollHeight);
    if (fullWidth * height > 18000000 || height > 14000)
      throw new Error(
        "This report is too large for an image-based Excel sheet. Use Print / Save PDF or a narrower report period.",
      );
    const png = await toPng(clone, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: fullWidth,
      height,
      style: {
        position: "relative",
        left: "0",
        top: "0",
        width: `${fullWidth}px`,
      },
      skipAutoScale: true,
    });
    return { png, width: fullWidth, height };
  } finally {
    wrapper.remove();
  }
}
