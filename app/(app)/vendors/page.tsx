import { Truck } from "lucide-react";
import {
  ArchiveVendorButton,
  VendorDialog,
} from "@/components/vendors/vendor-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Vendors" };

export default async function VendorsPage() {
  const { orgId } = await requireOrg();

  const vendors = await tenantDb(orgId).vendor.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Partners for outsourced work — foiling, die-cutting, wide-format…
          </p>
        </div>
        <VendorDialog />
      </div>

      {vendors.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Truck className="size-8" aria-hidden />
          <p>No vendors yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Services</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {vendor.services ?? "—"}
                  </TableCell>
                  <TableCell>{vendor.email ?? "—"}</TableCell>
                  <TableCell>{vendor.phone ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <VendorDialog vendor={vendor} />
                      <ArchiveVendorButton
                        vendorId={vendor.id}
                        name={vendor.name}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
