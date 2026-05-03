import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown", "text/x-markdown"];

const MIME_TO_FILE_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
};

function detectFileType(filename: string, mimeType: string): string {
  if (MIME_TO_FILE_TYPE[mimeType]) return MIME_TO_FILE_TYPE[mimeType];
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "md" || ext === "markdown") return "md";
  return "txt";
}

// POST /api/reports/templates/upload — upload a reference document to Supabase storage
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const templateId = formData.get("templateId") as string | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const fileType = detectFileType(file.name, file.type);
    if (!["pdf", "docx", "txt", "md"].includes(fileType)) {
      return NextResponse.json({ error: `Unsupported file type: ${fileType}` }, { status: 400 });
    }

    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File exceeds 25 MB limit" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("report-reference-docs")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      // Bucket likely doesn't exist — fall back to storing the file URL as a data URL for now
      if (uploadError.message?.includes("not found") || uploadError.message?.includes("bucket")) {
        return NextResponse.json({
          error: "Storage bucket 'report-reference-docs' not configured. Create it in Supabase Dashboard > Storage.",
        }, { status: 503 });
      }
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("report-reference-docs")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Extract text for TXT/MD
    let extractedText: string | undefined;
    if (fileType === "txt" || fileType === "md") {
      extractedText = fileBuffer.toString("utf-8").slice(0, 100_000);
    }

    // If we have a templateId, create the reference document record now
    let doc: Record<string, unknown> | null = null;
    if (templateId) {
      const { data: docData, error: docError } = await supabase
        .from("template_reference_documents")
        .insert({
          template_id: templateId,
          filename: file.name,
          file_url: publicUrl,
          file_type: fileType,
          extracted_text: extractedText ?? null,
          page_count: 1,
          metadata: {
            size: file.size,
            mimeType: file.type,
            storagePath,
          },
          created_by: user.id,
        })
        .select("id, template_id, report_project_id, filename, file_url, file_type, extracted_text, page_count, metadata, created_by, created_at")
        .single();

      if (docError) throw docError;
      doc = docData;
    }

    return NextResponse.json({
      status: true,
      fileUrl: publicUrl,
      storagePath,
      fileType,
      filename: file.name,
      extractedText: extractedText ?? null,
      size: file.size,
      document: doc,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "File upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
