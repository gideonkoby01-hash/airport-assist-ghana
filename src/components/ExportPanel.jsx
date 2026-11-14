import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadCsv, toCsv } from "@/lib/csv";
import { notifyError } from "@/lib/notify";

const PAGE = 500;

async function fetchAll(entity, query, sort) {
  const rows = [];
  let cursor;
  do {
    const page = await api.entities[entity].filter(query, { sort, limit: PAGE, cursor });
    rows.push(...page);
    cursor = page.next_cursor;
  } while (cursor);
  return rows;
}

const PAYMENT_COLUMNS = [
  { key: "created_date", label: "Recorded at" },
  { key: "booking_reference", label: "Booking" },
  { key: "entry_type", label: "Type" },
  { key: "amount", label: "Amount (GHS)" },
  { key: "method", label: "Method" },
  { key: "reason", label: "Reason" },
  { key: "balance_after", label: "Balance after (GHS)" },
  { key: "recorded_by_name", label: "Recorded by" },
];
const BOOKING_COLUMNS = [
  { key: "created_date", label: "Created" },
  { key: "reference", label: "Reference" },
  { key: "package_name", label: "Service" },
  { key: "booking_channel", label: "Channel" },
  { key: "status", label: "Status" },
  { key: "flight_date", label: "Flight date" },
  { key: "num_passengers", label: "Passengers" },
  { key: "original_total", label: "Price before discount (GHS)" },
  { key: "discount_amount", label: "Discount (GHS)" },
  { key: "total_value", label: "Total (GHS)" },
  { key: "amount_collected", label: "Collected (GHS)" },
  { key: "written_off", label: "Written off (GHS)" },
  { key: "outstanding_balance", label: "Outstanding (GHS)" },
  { key: "payment_status", label: "Payment status" },
  { key: "assigned_supervisor_name", label: "Supervisor" },
];

// CSV downloads for the accountant: the payments ledger (money in, refunds, write-offs) and the bookings.
export default function ExportPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const first = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState("");

  const run = async (kind) => {
    setBusy(kind);
    try {
      const range = { $gte: `${from}T00:00:00.000Z`, $lte: `${to}T23:59:59.999Z` };
      const query = { created_date: range };
      if (kind === "payments") {
        const rows = await fetchAll("Payment", query, "created_date");
        downloadCsv(`payments_${from}_to_${to}.csv`, toCsv(rows, PAYMENT_COLUMNS));
      } else {
        const rows = await fetchAll("Booking", query, "created_date");
        downloadCsv(`bookings_${from}_to_${to}.csv`, toCsv(rows, BOOKING_COLUMNS));
      }
    } catch (e) {
      notifyError(e.message || "The export could not be created.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Download className="w-4 h-4 text-accent" aria-hidden="true" /> Export for the accountant</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Downloads a spreadsheet (CSV) for the dates chosen, by the day each record was created. The payments file is the money ledger: payments, refunds and write-offs.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ex-from" className="text-xs">From</Label>
          <Input id="ex-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ex-to" className="text-xs">To</Label>
          <Input id="ex-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" onClick={() => run("payments")} disabled={Boolean(busy)}>
          {busy === "payments" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />} Payments
        </Button>
        <Button variant="outline" onClick={() => run("bookings")} disabled={Boolean(busy)}>
          {busy === "bookings" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />} Bookings
        </Button>
      </div>
    </div>
  );
}
