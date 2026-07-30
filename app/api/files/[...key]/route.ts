import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolvePortalToken } from "@/lib/portal/auth";
import { getStorage } from "@/lib/storage";

/**
 * Serves locally-stored uploads in dev. Two auth paths:
 *  - Clerk session: first key segment (orgId) must equal the active org.
 *  - Portal token (?token=): the file's job must belong to the token's
 *    company — clients only ever see their own artwork.
 * (Vercel Blob URLs bypass this route entirely.)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  if (key.length < 2) return new NextResponse("Not found", { status: 404 });

  const token = new URL(request.url).searchParams.get("token");
  let allowed = false;

  if (token) {
    const portal = await resolvePortalToken(token);
    if (portal && key[0] === portal.orgId) {
      const file = await portal.db.jobFile.findFirst({
        where: {
          blobKey: key.join("/"),
          job: { companyId: portal.company.id },
        },
        select: { id: true },
      });
      allowed = Boolean(file);
    }
  } else {
    const { orgId } = await auth();
    allowed = Boolean(orgId && key[0] === orgId);
  }

  if (!allowed) return new NextResponse("Not found", { status: 404 });

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
