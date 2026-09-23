import { useMemo, useState } from "react";
import { BadgeCheck, Coins, Pencil, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { NoAccess } from "@/components/no-access";
import { PERMISSION_MODULES, usePermissions } from "@/hooks/use-permissions";
import { PfiFormDialog } from "@/features/pfi/components/pfi-form-dialog";
import { CurrencyFormDialog } from "@/features/pfi/components/currency-form-dialog";
import { T1ValidationFormDialog } from "@/features/t1-validation/components/t1-validation-form-dialog";
import { useCurrencies, usePfiList } from "@/features/pfi/use-pfi";
import { useNominations } from "@/features/nominations/use-nominations";
import { errorCode, errorMessage } from "@/lib/error-message";
import { nominationQuantity } from '@/api/types'
import type { Currency, Pfi } from "@/api/types";

/** Amounts and rates arrive as strings, so they are parsed before formatting. */
function formatNumber(value: string | undefined): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : (value ?? "—");
}

export function PfiPage() {
  const permissions = usePermissions();
  // Currencies live under /pfi/currency and share these permissions — the
  // backend exposes no separate currency module.
  const { canRead, canCreate, canEdit } = permissions.forModule(
    PERMISSION_MODULES.pfi,
  );
  const canReadNominations = permissions.forModule(
    PERMISSION_MODULES.nominations,
  ).canRead;
  // T1 validations are raised from here, so the action is gated on that
  // module's create permission rather than anything on PFI.
  const canCreateT1 = permissions.forModule(
    PERMISSION_MODULES.t1Validation,
  ).canCreate;

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  /**
   * Only set filters are sent: each is validated when present, so `startDate=`
   * returns `400` rather than meaning "no filter". Dates are widened to cover
   * the whole day, as elsewhere.
   */
  const filter = useMemo(
    () => ({
      ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}),
      ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}),
    }),
    [startDate, endDate],
  );

  const isFiltered = Object.keys(filter).length > 0;

  const { pfis, isLoading, isError, error } = usePfiList({
    enabled: canRead,
    filter,
  });
  const { currencies } = useCurrencies({ enabled: canRead });
  // Only used to name the nomination a PFI was raised against.
  const { nominations } = useNominations({
    enabled: canRead && canReadNominations,
  });

  const [editId, setEditId] = useState<string | null>(null);
  /**
   * The **nomination** a new T1 is being raised for. A T1 belongs to a
   * nomination, not a PFI — the row simply passes its own `nominationId`.
   */
  const [t1ForNominationId, setT1ForNominationId] = useState<string | null>(
    null,
  );
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [editCurrency, setEditCurrency] = useState<Currency | null>(null);

  const columns: DataTableColumn<Pfi>[] = [
    {
      header: "PFI",
      cell: (row) => (
        <div>
          <span className="font-medium">{row.pfiReference}</span>
          {/* Server-generated, and spelled `pifCode` — not `pfiCode`. */}
          {row.pifCode && (
            <span className="block font-mono text-xs text-muted-foreground">
              {row.pifCode}
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Nomination",
      // Nominations nest their stock, so the item is available here — it says
      // what was invoiced, where the destination only says where it went.
      cell: (row) => {
        const match = nominations.find((n) => n.id === row.nominationId);
        if (!match) return <span className="text-muted-foreground">—</span>;
        return (
          <div>
            <span className="text-sm">
              {match.stock?.item?.name ? `${match.stock.item.name} · ` : ""}
              {match.destination}
            </span>
            {match.driverVehicle?.vechile.platNumber && (
              <span className="block text-xs text-muted-foreground">
                {match.driverVehicle.vechile.platNumber}
                {nominationQuantity(match)
                  ? ` · ${nominationQuantity(match).toLocaleString()}`
                  : ""}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: "Amount",
      cell: (row) => (
        <div className="tabular-nums">
          <span className="font-medium">{formatNumber(row.amount)}</span>{" "}
          {/* The stored code, which the API does not check against the
              currency — shown as-is so a mismatch is visible rather than hidden. */}
          <span className="text-xs text-muted-foreground">
            {row.currancyCode}
          </span>
        </div>
      ),
    },
    {
      header: "Rate",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.rate)}</span>
      ),
    },
    ...(canEdit || canCreateT1
      ? [
          {
            header: "",
            className: "text-right",
            cell: (row: Pfi) => (
              <div className="flex justify-end gap-1">
                {/* Raises a T1 for this PFI's **nomination** — the T1 page only
                    lists them. Disabled when the PFI has no nomination, since
                    that is the one thing a T1 requires. */}
                {canCreateT1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!row.nominationId}
                    onClick={() =>
                      setT1ForNominationId(row.nominationId ?? null)
                    }
                    title={
                      row.nominationId
                        ? "Raise a T1 validation for this nomination"
                        : "This PFI has no nomination"
                    }
                  >
                    <BadgeCheck className="size-3.5" />
                    T1
                  </Button>
                )}
                {/* There is no delete endpoint, so editing is the only
                    correction path. */}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditId(row.id)}
                    title="Edit PFI"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">PFI</h1>
        <p className="text-sm text-muted-foreground">
          Proforma invoices raised against nominations. New PFIs are raised from
          the Nominations page, against the nomination they invoice.
        </p>
      </div>

      {!canRead ? (
        <NoAccess resource="PFI" />
      ) : isError && errorCode(error) === "FORBIDDEN" ? (
        <NoAccess resource="PFI" variant="rejected" permission="pfi.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="filter-start" className="text-xs">
                Raised from
              </Label>
              <Input
                id="filter-start"
                type="date"
                className="h-8 w-40"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="filter-end" className="text-xs">
                Raised to
              </Label>
              <Input
                id="filter-end"
                type="date"
                className="h-8 w-40"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>

            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
              >
                <X className="size-3.5" />
                Clear
              </Button>
            )}
          </div>

          <DataTable
            columns={columns}
            data={pfis}
            rowKey={(row) => row.id}
            isLoading={isLoading}
            emptyMessage={
              isFiltered
                ? "No PFIs match these dates."
                : "No PFIs yet. Raise one from the Nominations page, against the nomination it invoices."
            }
            getSearchText={(row) =>
              `${row.pfiReference} ${row.pifCode ?? ""} ${row.currancyCode} ${
                nominations.find((n) => n.id === row.nominationId)
                  ?.destination ?? ""
              } ${
                nominations.find((n) => n.id === row.nominationId)?.stock?.item
                  ?.name ?? ""
              }`
            }
            searchPlaceholder="Search PFIs…"
            pageSize={15}
          />

          {/* Currencies are a small lookup table with no page of their own, so
              they are managed here — the endpoint sits under /pfi too. */}
          <section className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Coins className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Currencies</h2>
                <span className="text-xs text-muted-foreground">
                  {currencies.length} available
                </span>
              </div>
              {canCreate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditCurrency(null);
                    setCurrencyOpen(true);
                  }}
                >
                  <Plus />
                  Add currency
                </Button>
              )}
            </div>

            {currencies.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No currencies yet. Add one before raising a PFI.
              </p>
            ) : (
              <ul className="divide-y">
                {currencies.map((currency) => (
                  <li
                    key={currency.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <Badge variant="secondary" className="font-mono">
                      {currency.code}
                    </Badge>
                    <span className="text-sm">{currency.name}</span>
                    <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                      {formatNumber(currency.rate)}
                    </span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditCurrency(currency);
                          setCurrencyOpen(true);
                        }}
                        title="Edit currency"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Keyed by nomination so the form resets between rows. */}
      <T1ValidationFormDialog
        key={t1ForNominationId ?? "t1"}
        open={Boolean(t1ForNominationId)}
        onOpenChange={(next) => !next && setT1ForNominationId(null)}
        nominationId={t1ForNominationId}
        canReadNominations={canReadNominations}
      />

      {/* Edit only — creating happens on the Nominations page, where the
          nomination being invoiced is already in view. */}
      <PfiFormDialog
        key={editId ?? "edit"}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        pfiId={editId}
        canReadNominations={canReadNominations}
      />

      <CurrencyFormDialog
        key={editCurrency?.id ?? "new-currency"}
        open={currencyOpen}
        onOpenChange={(open) => {
          setCurrencyOpen(open);
          if (!open) setEditCurrency(null);
        }}
        currency={editCurrency}
      />
    </div>
  );
}
