"use client";

import { useTransition } from "react";
import { Archive } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Soft-delete with confirmation. `action` is a bound server action. */
export function ArchiveButton({
  action,
  entityLabel,
}: {
  action: () => Promise<void>;
  entityLabel: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="destructive" disabled={pending}>
            <Archive aria-hidden /> Archive
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {entityLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            It will disappear from lists but stays in the database (soft
            delete). An unarchive UI can restore it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => startTransition(() => action())}>
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
