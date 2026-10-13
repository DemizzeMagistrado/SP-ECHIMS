import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { ExportTable, LayoutBlock, GridCell } from "./report-export-tables";
const xml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function csv(tables: ExportTable[]): Buffer {
  const safe = (s: string) =>
    `"${(/^[\s\u0000-\u001f\uFEFF]*[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"`;
  const sections = tables.map((t) => {
    const occupied = new Set<string>();
    const grid = t.rows.map((row, ri) => {
      const values: string[] = [];
      let ci = 0;
      for (const cell of row) {
        while (occupied.has(`${ri}:${ci}`)) values[ci++] = "";
        values[ci] = cell.text;
        for (let y = ri; y < ri + cell.rowSpan; y++)
          for (let x = ci; x < ci + cell.colSpan; x++) {
            occupied.add(`${y}:${x}`);
            if (y === ri && x !== ci) values[x] = "";
          }
        ci += cell.colSpan;
      }
      return values;
    });
    const width = Math.max(1, ...grid.map((r) => r.length));
    return (
      safe(t.name) +
      "\r\n" +
      grid
        .map((r) =>
          Array.from({ length: width }, (_, i) => safe(r[i] ?? "")).join(","),
        )
        .join("\r\n")
    );
  });
  return Buffer.from("\uFEFF" + sections.join("\r\n\r\n") + "\r\n", "utf8");
}
const crcTable = Array.from({ length: 256 }, (_, i) => {
  for (let j = 0; j < 8; j++) i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
  return i >>> 0;
});
function crc32(b: Buffer) {
  let c = 0xffffffff;
  for (const n of b) c = crcTable[(c ^ n) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files: { name: string; content: string | Buffer }[]): Buffer {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name),
      raw = Buffer.from(f.content),
      packed = deflateRawSync(raw),
      crc = crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(8, 8);
    h.writeUInt16LE(33, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(packed.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(name.length, 26);
    local.push(h, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(33, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + packed.length;
  }
  const cb = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cb.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cb, end]);
}
function column(n: number) {
  let s = "";
  while (n) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
/** Uses a narrow worksheet grid so merged cells can preserve print table groups. */
export function xlsxLayout(layout: LayoutBlock, title: string): Buffer {
  const N = 60,
    cells: {
      r: number;
      c: number;
      span: number;
      rows: number;
      text: string;
      style: number;
      numeric: boolean;
    }[] = [],
    heights = new Map<number, number>();
  const styles: {
    bold: boolean;
    fill: string;
    center: boolean;
    border: boolean;
    font: number;
  }[] = [
    { bold: false, fill: "FFFFFF", center: false, border: false, font: 9 },
  ];
  function style(cls: string, header = false, heading = false, border = false) {
    const colors: Record<string, string> = {
      "bg-sky-50": "F0F9FF",
      "bg-sky-100": "E0F2FE",
      "bg-blue-50": "EFF6FF",
      "bg-yellow-100": "FEF9C3",
      "bg-red-100": "FEE2E2",
      "bg-muted": "F1F5F9",
      "bg-slate-800": "1E293B",
      "bg-[#123F65]": "123F65",
    };
    let fill = "FFFFFF";
    for (const [k, v] of Object.entries(colors)) if (cls.includes(k)) fill = v;
    const v = {
      bold:
        header ||
        heading ||
        cls.includes("font-bold") ||
        cls.includes("font-semibold"),
      fill,
      center: cls.includes("text-center") || heading,
      border,
      font: heading ? 12 : 9,
    };
    const id = styles.findIndex((s) => JSON.stringify(s) === JSON.stringify(v));
    if (id >= 0) return id;
    styles.push(v);
    return styles.length - 1;
  }
  function put(
    r: number,
    c: number,
    span: number,
    rows: number,
    text: string,
    id: number,
  ) {
    const numeric =
      /^(0|[1-9]\d*)(\.\d+)?$/.test(text) &&
      Number.isFinite(Number(text)) &&
      text.length < 15;
    cells.push({ r, c, span, rows, text, style: id, numeric });
    const lines = text
      .split("\n")
      .reduce(
        (sum, line) =>
          sum + Math.max(1, Math.ceil(line.length / Math.max(3, span * 2.25))),
        0,
      );
    heights.set(
      r,
      Math.max(
        heights.get(r) ?? 18,
        Math.min(409, Math.max(18, lines * 12 + 8) / rows),
      ),
    );
  }
  function draw(b: LayoutBlock, r: number, c: number, w: number): number {
    if (b.kind === "text") {
      put(r, c, w, 1, b.text, style(b.className, false, b.heading));
      return r + 1;
    }
    if (b.kind === "columns") {
      const count = Math.min(b.columns ?? 2, w),
        gap = 1,
        unit = Math.floor((w - gap * (count - 1)) / count);
      let y = r;
      for (let i = 0; i < b.children.length; i += count) {
        let end = y;
        for (let j = 0; j < count && i + j < b.children.length; j++) {
          const x = c + j * (unit + gap),
            width = j === count - 1 ? w - (x - c) : unit;
          end = Math.max(end, draw(b.children[i + j], y, x, width));
        }
        y = end + 1;
      }
      return y;
    }
    if (b.kind === "stack") {
      let y = r;
      for (const child of b.children) y = draw(child, y, c, w) + 1;
      return y;
    }
    if (b.caption) {
      put(
        r,
        c,
        w,
        1,
        b.caption,
        style(b.captionClass ?? "", false, false, true),
      );
      r++;
    }
    if (!b.rows.length) return r;
    const used = new Set<string>();
    let logicalWidth = 1;
    const logical: {
      r: number;
      c: number;
      cell: GridCell & { className?: string };
    }[] = [];
    b.rows.forEach((row, ri) => {
      let ci = 0;
      for (const cell of row) {
        while (used.has(`${ri}:${ci}`)) ci++;
        logical.push({ r: ri, c: ci, cell });
        for (let dy = ri; dy < ri + cell.rowSpan; dy++)
          for (let dx = ci; dx < ci + cell.colSpan; dx++)
            used.add(`${dy}:${dx}`);
        logicalWidth = Math.max(logicalWidth, ci + cell.colSpan);
        ci += cell.colSpan;
      }
    });
    const weights = Array.from({ length: logicalWidth }, () => 1);
    for (const p of logical)
      if (
        p.cell.header &&
        p.cell.colSpan === 1 &&
        /^(classification|summary|age group|indicator|commodity)$/i.test(
          p.cell.text.trim(),
        )
      )
        weights[p.c] = 2;
    const totalWeight = weights.reduce((sum, n) => sum + n, 0);
    const boundary = (index: number) =>
      c +
      Math.floor(
        (weights.slice(0, index).reduce((sum, n) => sum + n, 0) * w) /
          totalWeight,
      );
    for (const p of logical) {
      const x = boundary(p.c),
        right = boundary(p.c + p.cell.colSpan);
      put(
        r + p.r,
        x,
        Math.max(1, right - x),
        p.cell.rowSpan,
        p.cell.text,
        style(p.cell.className ?? "", p.cell.header, false, true),
      );
    }
    return r + b.rows.length;
  }
  const end = draw(layout, 1, 1, N);
  const merges = cells
    .filter((c) => c.span > 1 || c.rows > 1)
    .map(
      (c) =>
        `${column(c.c)}${c.r}:${column(c.c + c.span - 1)}${c.r + c.rows - 1}`,
    );
  const byRow = new Map<number, typeof cells>();
  for (const c of cells) {
    if (!byRow.has(c.r)) byRow.set(c.r, []);
    byRow.get(c.r)!.push(c);
  }
  const rows = [...byRow]
    .sort(([a], [b]) => a - b)
    .map(
      ([r, cc]) =>
        `<row r="${r}" ht="${heights.get(r) ?? 18}" customHeight="1">${cc
          .sort((a, b) => a.c - b.c)
          .map(
            (c) =>
              `<c r="${column(c.c)}${r}" s="${c.style}"${c.numeric ? "" : ' t="inlineStr"'}>${c.numeric ? "<v>" + c.text + "</v>" : '<is><t xml:space="preserve">' + xml(c.text) + "</t></is>"}</c>`,
          )
          .join("")}</row>`,
    )
    .join("");
  const stylesXML = `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${styles.length}">${styles.map((s) => `<font>${s.bold ? "<b/>" : ""}<sz val="${s.font}"/><color rgb="FF${["123F65", "1E293B"].includes(s.fill) ? "FFFFFF" : "0F2750"}"/><name val="Calibri"/></font>`).join("")}</fonts><fills count="${styles.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${styles.map((s) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/></patternFill></fill>`).join("")}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.map((s, i) => `<xf numFmtId="0" fontId="${i}" fillId="${i + 2}" borderId="${s.border ? 1 : 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="${s.center ? "center" : "left"}" wrapText="1"/></xf>`).join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    },
    {
      name: "_rels/.rels",
      content:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Printed report" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Printed report'!$A$1:$BH$${end}</definedName></definedNames></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    },
    { name: "xl/styles.xml", content: stylesXML },
    {
      name: "xl/worksheets/sheet1.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><cols><col min="1" max="${N}" width="2.2" customWidth="1"/></cols><sheetData>${rows}</sheetData><mergeCells count="${merges.length}">${merges.map((m) => '<mergeCell ref="' + m + '"/>').join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${xml(title)}&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter></worksheet>`,
    },
  ]);
}
/** A visual first sheet, with server-derived editable cells on the second sheet. */
export function xlsxAppearance(
  layout: LayoutBlock,
  title: string,
  png: Buffer,
  displayWidth: number,
  displayHeight: number,
): Buffer {
  const original = xlsxLayout(layout, title),
    files: { name: string; content: string | Buffer }[] = [];
  let at = 0;
  while (
    at + 30 < original.length &&
    original.readUInt32LE(at) === 0x04034b50
  ) {
    const size = original.readUInt32LE(at + 18),
      nameLength = original.readUInt16LE(at + 26),
      extra = original.readUInt16LE(at + 28),
      start = at + 30 + nameLength + extra;
    const name = original.subarray(at + 30, at + 30 + nameLength).toString(),
      bytes = inflateRawSync(original.subarray(start, start + size));
    if (name === "xl/worksheets/sheet1.xml")
      files.push({ name: "xl/worksheets/sheet2.xml", content: bytes });
    else if (
      ![
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
      ].includes(name)
    )
      files.push({
        name,
        content:
          name === "xl/styles.xml"
            ? bytes
                .toString()
                .replace(
                  /(<fonts[^>]*><font><sz val=")9("\/>)/,
                  (_match, before, after) => before + "11" + after,
                )
            : bytes,
      });
    at = start + size;
  }
  const printColumns = Math.max(1, Math.ceil(displayWidth / 1785));
  const rows = Math.max(1, Math.ceil(displayHeight / 24)),
    heightEMU = Math.round(displayHeight * 9525),
    widthEMU = Math.round(displayWidth * 9525);
  files.push(
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Report appearance" sheetId="1" r:id="rId1"/><sheet name="Editable data" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Report appearance'!$A$1:$${column(printColumns)}$${rows}</definedName></definedNames></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" zoomScale="75" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="${printColumns}" width="${Math.max(8, (displayWidth / printColumns - 5) / 7)}" customWidth="1"/></cols><sheetData/><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/><drawing r:id="rId1"/></worksheet>`,
    },
    {
      name: "xl/worksheets/_rels/sheet1.xml.rels",
      content:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
    },
    {
      name: "xl/drawings/drawing1.xml",
      content: `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${widthEMU}" cy="${heightEMU}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="${xml(title)}" descr="Report appearance captured from the approved displayed report. Editable server-snapshot data is on the second sheet."/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEMU}" cy="${heightEMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`,
    },
    {
      name: "xl/drawings/_rels/drawing1.xml.rels",
      content:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/report.png"/></Relationships>',
    },
    { name: "xl/media/report.png", content: png },
  );
  return zip(files);
}
