import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

/**
 * Serves locally-stored uploads in dev. Tenant fence: the first key
 * segment is the organizationId and must equal the caller's active org.
 * (Vercel Blob URLs bypass this route entirely.)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { orgId } = await auth();
  if (!orgId) return new NextResponse("Unauthorized", { status: 401 });

  const { key } = await params;
  if (key.length < 2 || key[0] !== orgId) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const data = await getStorage().get(key.join("/"));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(key[key.length - 1])}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
