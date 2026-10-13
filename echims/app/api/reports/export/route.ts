import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exportLayout,
  layoutTables,
  type ExportReport,
} from "@/lib/reports/report-export-tables";
import {
  csv,
  xlsxLayout,
  xlsxAppearance,
} from "@/lib/reports/report-export-files";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const error = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers });
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      raw = url.searchParams.get("reportId") ?? "",
      format = (url.searchParams.get("format") ?? "").toUpperCase();
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)))
      return error("Invalid report ID.", 400);
    if (!["CHECK", "CSV", "XLSX"].includes(format))
      return error(
        "Choose CHECK, CSV or XLSX. Use approved Print / Save PDF for the reference PDF layout.",
        400,
      );
    const db = await createClient(),
      auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return error("Please sign in.", 401);
    const result = await db.rpc("get_report_export", {
      p_report_id: Number(raw),
    });
    if (result.error) {
      if (result.error.code === "42501")
        return error(result.error.message, 403);
      console.error("Report export:", result.error);
      return error("Unable to authorize report export.", 500);
    }
    if (result.data?.currentUserId !== auth.data.user.id)
      return error("Session changed. Refresh reports.", 409);
    const report = result.data.report as ExportReport;
    if (
      report.status !== "VALIDATED" ||
      !report.validated_by_name ||
      !report.validated_at
    )
      return error("PHN validation is required.", 403);
    if (format === "CHECK")
      return NextResponse.json(
        { reportId: report.report_id, status: report.status },
        { headers },
      );
    const layout = exportLayout(
      report,
      url.searchParams.get("section") ?? undefined,
      url.searchParams.get("mode") ?? undefined,
    );
    const tables = layoutTables(layout),
      bytes = format === "CSV" ? csv(tables) : xlsxLayout(layout, report.title);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...headers,
        "Content-Type":
          format === "CSV"
            ? "text/csv; charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="eCHIMS-${report.module}-${report.report_id}-v${report.version}.${format.toLowerCase()}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Invalid report section.")
      return error(e.message, 400);
    console.error("Report export:", e);
    return error("Unable to export the saved report.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const db = await createClient(),
      auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return error("Please sign in.", 401);
    const declared = Number(request.headers.get("Content-Length") ?? 0);
    if (declared > 24000000)
      return error(
        "Report image is too large. Use PDF or a narrower report period.",
        413,
      );
    const raw = await request.text();
    if (raw.length > 24000000) return error("Report image is too large.", 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.reportId !== "number" ||
      !Number.isSafeInteger(body.reportId) ||
      body.reportId <= 0
    )
      return error("Invalid report ID.", 400);
    const authorized = await db.rpc("get_report_export", {
      p_report_id: body.reportId,
    });
    if (authorized.error)
      return error(
        authorized.error.code === "42501"
          ? authorized.error.message
          : "Unable to authorize report export.",
        authorized.error.code === "42501" ? 403 : 500,
      );
    if (authorized.data?.currentUserId !== auth.data.user.id)
      return error("Session changed. Refresh reports.", 409);
    const report = authorized.data.report as ExportReport;
    if (
      report.status !== "VALIDATED" ||
      !report.validated_by_name ||
      !report.validated_at
    )
      return error("PHN validation is required.", 403);
    if (
      typeof body.png !== "string" ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(body.png) ||
      typeof body.width !== "number" ||
      typeof body.height !== "number" ||
      !Number.isSafeInteger(body.width) ||
      !Number.isSafeInteger(body.height) ||
      body.width < 1 ||
      body.width > 10000 ||
      body.height < 1 ||
      body.height > 14000
    )
      return error("Invalid report image.", 400);
    const png = Buffer.from(
      body.png.slice("data:image/png;base64,".length),
      "base64",
    );
    if (
      png.length < 33 ||
      png.length > 18000000 ||
      png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      png.subarray(12, 16).toString() !== "IHDR" ||
      png.readUInt32BE(16) !== body.width * 2 ||
      png.readUInt32BE(20) !== body.height * 2 ||
      body.width * body.height > 18000000
    )
      return error("Invalid image dimensions or size.", 400);
    if (
      (body.section !== undefined && typeof body.section !== "string") ||
      (body.mode !== undefined && typeof body.mode !== "string")
    )
      return error("Invalid report section.", 400);
    const layout = exportLayout(
        report,
        body.section as string | undefined,
        body.mode as string | undefined,
      ),
      bytes = xlsxAppearance(
        layout,
        report.title,
        png,
        body.width,
        body.height,
      );
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...headers,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="eCHIMS-${report.module}-${report.report_id}-v${report.version}-appearance.xlsx"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof SyntaxError) return error("Invalid request body.", 400);
    if (e instanceof Error && e.message === "Invalid report section.")
      return error(e.message, 400);
    console.error("Report appearance export:", e);
    return error("Unable to create the report appearance workbook.", 500);
  }
}
