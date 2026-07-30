import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Labeled input with server-side validation error display. */
export function FormField({
  label,
  name,
  error,
  ...inputProps
}: {
  label: string;
  name: string;
  error?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={!!error} {...inputProps} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
