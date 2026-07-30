"use client";

import { useTransition } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generatePortalLink } from "@/lib/actions/portal-access";

/** Generates/rotates the contact's portal link and copies it. */
export function PortalLinkButton({ contactId }: { contactId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await generatePortalLink(contactId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          const url = `${window.location.origin}${result.path}`;
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Portal link copied — share it with the client");
          } catch {
            toast.info(`Portal link: ${url}`);
          }
        })
      }
    >
      <Link2 aria-hidden /> {pending ? "Generating…" : "Portal link"}
    </Button>
  );
}
