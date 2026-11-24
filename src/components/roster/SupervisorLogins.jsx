import React, { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Printer } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkLoginRows, loginsPage, loginsText, nameOnlyPeople } from "@/lib/rosterLogins";

const SHIFT_NAMES = ["One", "Two", "Three", "Four"];

// Admin only. The supervisors on the roster by name have no login yet. Type an email next to each (the name can be corrected too) and press
// Create logins: each gets an account with a temporary password, and the name on the roster becomes the account, in the same shift. People
// with no email typed are left for later. The passwords are shown once.
export default function SupervisorLogins({ members, onDone }) {
  const people = nameOnlyPeople(members).sort((a, b) => a.group_no - b.group_no || (a.position ?? 0) - (b.position ?? 0));
  const [rows, setRows] = useState({});
  const [problems, setProblems] = useState({});
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [copied, setCopied] = useState(false);

  const value = (m) => ({ name: rows[m.person_id]?.name ?? m.person_name, email: rows[m.person_id]?.email ?? "" });
  const set = (m, patch) => setRows((r) => ({ ...r, [m.person_id]: { ...value(m), ...patch } }));

  const create = async (e) => {
    e.preventDefault();
    const checked = checkLoginRows(people.map((m) => ({ id: m.person_id, ...value(m) })));
    setProblems(checked.errors);
    if (!checked.ok || checked.ready.length === 0) return;
    setBusy(true);
    const out = [];
    for (const r of checked.ready) {
      try {
        const res = await api.functions.invoke("createStaffAccount", { full_name: r.name, email: r.email, role: "supervisor" });
        const account = res.data;
        let note = "";
        if (account.user_id) {
          try {
            await api.rosters.linkAccount(r.id, account.user_id);
          } catch (err) {
            note = `The account was made, but it could not be put in the roster's place (${err.message}). Press "Add people who are missing".`;
          }
        } else {
          note = 'The account was made. Press "Add people who are missing" to put it on the roster.';
        }
        out.push({ id: r.id, name: r.name, email: r.email, password: account.temporary_password, note });
      } catch (err) {
        out.push({ id: r.id, name: r.name, email: r.email, error: err.message || "The account could not be made." });
      }
    }
    setBusy(false);
    setResults(out);
    // the ones that worked leave the list; the others keep what was typed
    setRows((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => out.find((o) => o.id === id)?.error)));
    onDone?.();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(loginsText(results));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // the passwords are on screen to copy by hand
    }
  };
  const print = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(loginsPage(results, window.location.origin));
    win.document.close();
    win.focus();
    win.print();
  };

  if (people.length === 0 && !results) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label="Create logins for supervisors">
      <h3 className="text-sm font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4 text-accent" aria-hidden="true" /> Create logins for supervisors</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">
        These supervisors are on the roster by name and cannot sign in yet. Type an email next to each person to make their login (correct the name first if needed).
        They get a temporary password and choose their own the first time they sign in. Anyone left without an email stays as they are.
      </p>

      {results && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-950" role="status">
          <p className="text-sm font-medium">{results.filter((r) => r.password).length} login{results.filter((r) => r.password).length === 1 ? "" : "s"} made{results.some((r) => r.error) ? `, ${results.filter((r) => r.error).length} not made` : ""}.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.id}>
                <strong>{r.name}</strong> · {r.email}
                {r.password ? <> · <code className="font-mono bg-white border border-emerald-200 rounded px-1.5 py-0.5 select-all">{r.password}</code></> : <span className="text-destructive"> · {r.error}</span>}
                {r.note && <span className="block text-xs text-amber-800">{r.note}</span>}
              </li>
            ))}
          </ul>
          {results.some((r) => r.password) && (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={copy}>{copied ? <Check className="w-4 h-4 mr-1" aria-hidden="true" /> : <Copy className="w-4 h-4 mr-1" aria-hidden="true" />} {copied ? "Copied" : "Copy all"}</Button>
                <Button type="button" size="sm" variant="outline" onClick={print}><Printer className="w-4 h-4 mr-1" aria-hidden="true" /> Print a slip for each</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setResults(null)}>Done</Button>
              </div>
              <p className="text-xs mt-2">These passwords are shown only once and cannot be looked up later. Give each to the person directly, not in a public message.</p>
            </>
          )}
        </div>
      )}

      {people.length > 0 && (
        <form onSubmit={create} noValidate>
          <ul className="divide-y divide-border/60">
            {people.map((m) => {
              const v = value(m);
              return (
                <li key={m.person_id} className="py-2 grid sm:grid-cols-[7.5rem_1fr_1fr] gap-2 items-start">
                  <span className="text-xs text-muted-foreground pt-2.5">Shift {SHIFT_NAMES[m.group_no - 1]}</span>
                  <Input aria-label={`Name of ${m.person_name}`} value={v.name} maxLength={60} onChange={(e) => set(m, { name: e.target.value })} />
                  <div>
                    <Input aria-label={`Email for ${m.person_name}`} type="email" inputMode="email" autoComplete="off" placeholder="Email (to make a login)" value={v.email} onChange={(e) => set(m, { email: e.target.value })} />
                    {problems[m.person_id] && <p role="alert" className="text-xs text-destructive mt-1">{problems[m.person_id]}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <Button type="submit" className="mt-3" disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : <KeyRound className="w-4 h-4 mr-2" aria-hidden="true" />} Create logins
          </Button>
        </form>
      )}
    </section>
  );
}
