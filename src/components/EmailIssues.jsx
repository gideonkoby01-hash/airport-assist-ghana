import React, { useEffect, useState } from "react";
import { Loader2, MailWarning, RefreshCw } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";

const PROBLEM = ["failed", "bounced", "complained"];
const LABELS = { failed: "Not sent", bounced: "Bounced", complained: "Marked as spam" };

// Emails that did not reach a person. "Not sent" ones are retried automatically up to three times; after that, or
// to try right away, use Retry. Bounced and spam-marked emails mean the address is wrong or unwelcome: fix the address instead.
export default function EmailIssues() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const page = await api.entities.EmailDelivery.filter({ status: { $in: PROBLEM } }, { sort: "-created_date", limit: 100 });
      setRows(page.items || []);
    } catch (e) {
      setError(e.message || "Could not load email problems.");
      setRows([]);
    }
  };
  useEffect(() => { load(); }, []);

  const retry = async (row) => {
    setBusy(row.id);
    setError("");
    try {
      await api.functions.invoke("retryEmail", { delivery_id: row.id });
    } catch (e) {
      setError(e.message || "Could not retry that email.");
    } finally {
      setBusy("");
      load();
    }
  };

  if (!rows) return <div className="flex items-center text-sm text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><MailWarning className="w-4 h-4 text-accent" aria-hidden="true" /> Email problems</h3>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
      </div>
      {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No problems. Every email we tried to send was accepted.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-2 pr-3">When</th><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Problem</th><th className="py-2 pr-3">Tries</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="py-2 pr-3">{r.template_name}</td>
                  <td className="py-2 pr-3"><span className="font-medium">{LABELS[r.status]}</span><br /><span className="text-xs text-muted-foreground">{r.details}</span></td>
                  <td className="py-2 pr-3">{r.attempts}</td>
                  <td className="py-2">
                    {r.status === "failed" && r.to_email && (
                      <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => retry(r)}>
                        {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Retry"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
