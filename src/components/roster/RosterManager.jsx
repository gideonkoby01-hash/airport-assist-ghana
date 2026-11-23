import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, Loader2, Pencil, Plus, Printer, Shuffle, Star, Trash2, UserMinus, UserPlus, Wand2, X } from "lucide-react";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ConfirmAction from "@/components/ConfirmAction";
import { downloadCsv, toCsv } from "@/lib/csv";
import { notifyError } from "@/lib/notify";
import { todayUtc } from "@/lib/bookingFormRules";
import {
  addMonths, buildSheet, groupNames, groupSizes, isBalanced, KINDS, monthStart, monthTitle, personShifts, sheetCsvRows, sheetCss, sheetHtml, sheetPage,
} from "@/lib/roster";

const SHIFT_NAMES = ["One", "Two", "Three", "Four"];
const CODE_WORDS = { M: "Morning", N: "Night" };

// Opens the sheet in its own tab to print or save as PDF (the same way receipts do), so the dashboard's menus never appear on it.
function printSheet(sheet) {
  const win = window.open("", "_blank");
  if (!win) return notifyError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
  win.document.open();
  win.document.write(sheetPage(sheet));
  win.document.close();
  const bar = win.document.createElement("div");
  bar.className = "no-print";
  bar.style.cssText = "margin:0 0 12px;font-family:Arial,sans-serif";
  const btn = win.document.createElement("button");
  btn.textContent = "Print or save as PDF";
  btn.style.cssText = "padding:8px 14px;font-size:14px;cursor:pointer";
  btn.addEventListener("click", () => win.print());
  bar.appendChild(btn);
  win.document.body.insertBefore(bar, win.document.body.firstChild);
}

function StartForm({ kind, month, hasEarlier, busy, onGenerate }) {
  const [first, setFirst] = useState("1");
  const [head, setHead] = useState(month);
  const previous = addMonths(month, -1);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold">No {KINDS[kind].toLowerCase()} roster for {monthTitle(month)} yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {hasEarlier
            ? `It carries on from the last month: the same pattern, the same shifts and people. New people join the smallest shift, and people who have left are dropped. You can reshuffle or move anyone afterwards.`
            : "This is the first roster, so say where the pattern starts. After this, every new month carries on by itself."}
        </p>
      </div>
      {!hasEarlier && (
        <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
          <div className="space-y-1.5">
            <Label htmlFor="ro-first">Which shift works the morning on the 1st?</Label>
            <Select value={first} onValueChange={setFirst}>
              <SelectTrigger id="ro-first"><SelectValue /></SelectTrigger>
              <SelectContent>{SHIFT_NAMES.map((n, i) => <SelectItem key={n} value={String(i + 1)}>Shift {n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {kind === "supervisor" && (
            <div className="space-y-1.5">
              <Label htmlFor="ro-head">First day of the head supervisor (H. SUP)</Label>
              <Input id="ro-head" type="date" value={head} min={month} max={`${month.slice(0, 7)}-28`} onChange={(e) => setHead(e.target.value)} />
              <p className="text-xs text-muted-foreground">The shift on the morning that day is head supervisor for it and the night after. The mark then moves on every five days.</p>
            </div>
          )}
        </div>
      )}
      <Button onClick={() => onGenerate(Number(first), kind === "supervisor" ? head : null)} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : <Wand2 className="w-4 h-4 mr-2" aria-hidden="true" />}
        {hasEarlier ? `Make ${monthTitle(month)} from ${monthTitle(previous)}` : `Make the ${monthTitle(month)} roster`}
      </Button>
    </div>
  );
}

function PersonRow({ m, editable, busy, onMove, onLead, onRemove, onRename }) {
  const nameOnly = String(m.person_id).startsWith("name:");
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(m.person_name);
  if (renaming) {
    return (
      <li className="py-1.5">
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); onRename(m, value.trim()); setRenaming(false); }}>
          <Input aria-label={`New name for ${m.person_name}`} className="h-8 flex-1" value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} autoFocus />
          <button type="submit" aria-label="Save the name" disabled={value.trim().length < 2} className="press p-1.5 rounded-md text-emerald-700 disabled:opacity-40"><Check className="w-4 h-4" aria-hidden="true" /></button>
          <button type="button" aria-label="Keep the old name" onClick={() => { setRenaming(false); setValue(m.person_name); }} className="press p-1.5 rounded-md text-muted-foreground"><X className="w-4 h-4" aria-hidden="true" /></button>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="flex-1 min-w-0 truncate text-sm">{m.lead ? "**" : ""}{m.person_name}</span>
      {editable && (
        <>
          {nameOnly && (
            <button type="button" onClick={() => { setValue(m.person_name); setRenaming(true); }} disabled={busy} aria-label={`Correct the name ${m.person_name}`} className="press p-1.5 rounded-md text-muted-foreground hover:text-foreground">
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={() => onLead(m)} disabled={busy} aria-pressed={m.lead} aria-label={`${m.lead ? "Remove the ** mark from" : "Mark"} ${m.person_name}`}
            className={`press p-1.5 rounded-md ${m.lead ? "text-amber-500" : "text-muted-foreground hover:text-foreground"}`}>
            <Star className="w-4 h-4" fill={m.lead ? "currentColor" : "none"} aria-hidden="true" />
          </button>
          <select aria-label={`Shift for ${m.person_name}`} value={m.group_no} disabled={busy} onChange={(e) => onMove(m, Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-card px-1.5 text-sm">
            {SHIFT_NAMES.map((n, i) => <option key={n} value={i + 1}>Shift {n}</option>)}
          </select>
          <button type="button" onClick={() => onRemove(m)} disabled={busy} aria-label={`Take ${m.person_name} off this roster`} className="press p-1.5 rounded-md text-muted-foreground hover:text-destructive">
            <UserMinus className="w-4 h-4" aria-hidden="true" />
          </button>
        </>
      )}
    </li>
  );
}

// Adds someone by name, to a shift, as and when it is needed. A name that belongs to a supervisor account (or a porter on the register) adds that account.
function AddPerson({ kind, busy, onAdd }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("1");
  const [lead, setLead] = useState(false);
  const word = kind === "porter" ? "porter" : "supervisor";
  const submit = async (e) => {
    e.preventDefault();
    const ok = await onAdd(name.trim(), Number(group), lead);
    if (ok) { setName(""); setLead(false); }
  };
  return (
    <form onSubmit={submit} className="mt-4 pt-4 border-t border-border flex flex-wrap items-end gap-3" aria-label={`Add a ${word}`}>
      <div className="space-y-1.5 flex-1 min-w-[12rem]">
        <Label htmlFor="ro-add-name">Add a {word}</Label>
        <Input id="ro-add-name" value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)} placeholder="Name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ro-add-shift">Shift</Label>
        <select id="ro-add-shift" value={group} onChange={(e) => setGroup(e.target.value)} className="h-10 rounded-md border border-input bg-card px-2 text-sm">
          {SHIFT_NAMES.map((n, i) => <option key={n} value={i + 1}>Shift {n}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm h-10"><input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} /> Mark with **</label>
      <Button type="submit" disabled={busy || name.trim().length < 2}><UserPlus className="w-4 h-4 mr-1.5" aria-hidden="true" /> Add to roster</Button>
      {kind === "porter" && <p className="basis-full text-xs text-muted-foreground">A new porter should also be added to the porter register (Admin &gt; Porters) with a phone number.</p>}
    </form>
  );
}

// The monthly shift roster for supervisors and porters, in the layout the team uses on paper. Managers (the "rosters.manage" task) make a month,
// move people between the four shifts, reshuffle and print it; everyone else who can open it only reads it. `highlightPerson` shows that
// person's own next shifts at the top (a supervisor looking at their own).
export default function RosterManager({ canManage = false, highlightPerson = null, kinds = ["supervisor", "porter"] }) {
  const { user } = useAuth();
  const [kind, setKind] = useState(kinds[0]);
  const [month, setMonth] = useState(monthStart(todayUtc()));
  const [state, setState] = useState({ loading: true, error: "", data: null, months: [] });
  const [busy, setBusy] = useState(false);
  const [cycle, setCycle] = useState({ open: false, first: "1", head: "" });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [data, months] = await Promise.all([api.rosters.get(kind, month), api.rosters.months(kind)]);
      setState({ loading: false, error: "", data, months });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || "Could not load the roster. If this is new, run the shift roster database update first." }));
    }
  }, [kind, month]);
  useEffect(() => { load(); }, [load]);

  const { data, months } = state;
  const thisMonth = monthStart(todayUtc());
  const isAdmin = user?.role === "admin";
  const structural = canManage && month >= thisMonth; // making, reshuffling, restarting and deleting: this month or later
  const editable = canManage && (month >= thisMonth || isAdmin); // the people: an admin may also correct a past month
  const hasEarlier = months.some((m) => m.month < month);
  const hasLater = months.some((m) => m.month > month);
  const sheet = useMemo(() => (data ? buildSheet(data.roster, data.members) : null), [data]);
  const sizes = data ? groupSizes(data.members) : [];
  const mine = data && highlightPerson ? personShifts(data.roster, data.members, highlightPerson) : null;
  const upcoming = (mine || []).filter((d) => d.date >= todayUtc() && d.code !== "O").slice(0, 6);

  const run = async (fn, after) => {
    setBusy(true);
    try {
      await fn();
      if (after) after();
      await load();
      return true;
    } catch (e) {
      notifyError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => downloadCsv(`${kind}_roster_${month.slice(0, 7)}.csv`, toCsv(sheetCsvRows(sheet), [
    { key: "date", label: "Date" }, { key: "day", label: "Day" },
    ...[1, 2, 3, 4].map((g) => ({ key: `shift_${g}`, label: `Shift ${SHIFT_NAMES[g - 1]}: ${groupNames(data.members, g).map((p) => p.label).join(", ")}` })),
  ]));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><CalendarDays className="w-5 h-5 text-accent" aria-hidden="true" /> Shift roster</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Four shifts take turns on the morning (M) and the night (N); the other two are off (O). Made a month at a time.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {kinds.length > 1 && (
          <div className="inline-flex rounded-full border border-border bg-card p-0.5" role="group" aria-label="Whose roster">
            {kinds.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                className={`press px-4 py-1.5 rounded-full text-sm ${kind === k ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}>{KINDS[k]}</button>
            ))}
          </div>
        )}
        <div className="inline-flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Earlier month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="w-4 h-4" aria-hidden="true" /></Button>
          <span className="min-w-[9.5rem] text-center font-semibold" aria-live="polite">{monthTitle(month)}</span>
          <Button variant="outline" size="icon" aria-label="Later month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="w-4 h-4" aria-hidden="true" /></Button>
        </div>
        {month !== thisMonth && <Button variant="ghost" size="sm" onClick={() => setMonth(thisMonth)}>This month</Button>}
      </div>

      {state.error && <p role="alert" className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl p-3">{state.error}</p>}
      {state.loading && !data && <div className="flex items-center justify-center py-14 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" /> Loading…</div>}

      {!state.loading && !data && !state.error && (
        structural
          ? <StartForm kind={kind} month={month} hasEarlier={hasEarlier} busy={busy}
              onGenerate={(first, head) => run(() => api.rosters.generate(kind, month, hasEarlier ? null : first, head))} />
          : <p className="text-sm text-muted-foreground rounded-2xl border border-border bg-card p-5" role="status">
              {month < thisMonth ? `No roster was made for ${monthTitle(month)}.` : `The ${KINDS[kind].toLowerCase()} roster for ${monthTitle(month)} has not been made yet.`}
            </p>
      )}

      {data && (
        <>
          {mine && (
            <section className="rounded-2xl border border-border bg-card p-4" aria-label="Your shifts">
              <h3 className="text-sm font-semibold">Your shift: Shift {SHIFT_NAMES[(data.members.find((m) => String(m.person_id) === String(user?.id))?.group_no || 1) - 1]}</h3>
              {upcoming.length === 0
                ? <p className="text-sm text-muted-foreground mt-1">No more working days this month.</p>
                : <ul className="mt-2 flex flex-wrap gap-2">{upcoming.map((d) => (
                    <li key={d.date} className="rounded-lg bg-secondary px-3 py-1.5 text-sm">{d.weekdayName.slice(0, 3)} {d.day}: <strong>{CODE_WORDS[d.code]}</strong>{d.head ? " · head supervisor" : ""}</li>
                  ))}</ul>}
            </section>
          )}

          {canManage && month < thisMonth && (
            <p className="text-xs text-muted-foreground" role="status">
              {isAdmin ? "This month is over. As admin you can still correct who is on it; the pattern of the month is fixed." : "Past months cannot be changed. An admin can correct who was on one."}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => printSheet(sheet)}><Printer className="w-4 h-4 mr-1.5" aria-hidden="true" /> Print or save as PDF</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Download for Excel</Button>
            {editable && (
              <>
                {structural && (
                <ConfirmAction title="Reshuffle everyone?" confirmLabel="Reshuffle" onConfirm={() => run(() => api.rosters.shuffle(data.roster.id))}
                  description="Everyone is put into the four shifts again, at random and evenly, with the people marked ** kept in different shifts. You can still move anyone afterwards. The pattern of morning, night and off days does not change.">
                  <Button variant="outline" size="sm" disabled={busy}><Shuffle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Reshuffle</Button>
                </ConfirmAction>
                )}
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(async () => { const n = await api.rosters.addMissing(data.roster.id); if (!n) notifyError("Everyone is already on this roster."); })}>
                  <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> Add people who are missing
                </Button>
                {structural && !hasLater && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setCycle({ open: !cycle.open, first: "1", head: "" })}>Change who starts</Button>
                )}
                {structural && !hasLater && (
                  <ConfirmAction title={`Delete the ${monthTitle(month)} roster?`} destructive confirmLabel="Delete it" onConfirm={() => run(() => api.rosters.remove(data.roster.id))}
                    description="The roster for this month is removed. You can make it again afterwards, which starts from the last month.">
                    <Button variant="ghost" size="sm" className="text-destructive" disabled={busy}><Trash2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Delete</Button>
                  </ConfirmAction>
                )}
              </>
            )}
          </div>
          {structural && hasLater === false && cycle.open && (
            <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ro-cycle-first">Shift on the morning of the 1st</Label>
                <Select value={cycle.first} onValueChange={(v) => setCycle((c) => ({ ...c, first: v }))}>
                  <SelectTrigger id="ro-cycle-first" className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>{SHIFT_NAMES.map((n, i) => <SelectItem key={n} value={String(i + 1)}>Shift {n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {kind === "supervisor" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ro-cycle-head">Head supervisor starts on (optional)</Label>
                  <Input id="ro-cycle-head" type="date" min={month} max={`${month.slice(0, 7)}-28`} value={cycle.head} onChange={(e) => setCycle((c) => ({ ...c, head: e.target.value }))} />
                </div>
              )}
              <Button disabled={busy} onClick={() => run(() => api.rosters.setCycle(data.roster.id, Number(cycle.first), cycle.head || null), () => setCycle({ open: false, first: "1", head: "" }))}>Apply to {monthTitle(month)}</Button>
              <p className="basis-full text-xs text-muted-foreground">This changes the whole month, and later months carry on from it.</p>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-border bg-white p-4 text-black" tabIndex={0} aria-label={`${KINDS[kind]} roster for ${monthTitle(month)}`}>
            <style>{sheetCss()}</style>
            <div dangerouslySetInnerHTML={{ __html: sheetHtml(sheet) }} />
          </div>

          <section className="rounded-2xl border border-border bg-card p-4" aria-label="People and shifts">
            <h3 className="text-sm font-semibold">People and shifts</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              {editable ? "Move someone with the shift list beside their name. The star puts ** in front of the name on the sheet. The pencil corrects a name that was typed in." : "Who is in each shift."}
              {" "}{sizes.join(" · ")} people in shifts One to Four.
              {!isBalanced(data.members) && <span className="text-amber-700"> The shifts are uneven; Reshuffle evens them out.</span>}
            </p>
            {data.members.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nobody is on this roster yet. {editable ? "Press “Add people who are missing”." : ""}</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
                {[1, 2, 3, 4].map((g) => (
                  <div key={g}>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shift {SHIFT_NAMES[g - 1]}</h4>
                    <ul className="divide-y divide-border/60">
                      {groupNames(data.members, g).map((m) => (
                        <PersonRow key={m.person_id} m={m} editable={editable} busy={busy}
                          onMove={(p, to) => run(() => api.rosters.setMember(data.roster.id, p.person_id, to, null))}
                          onLead={(p) => run(() => api.rosters.setMember(data.roster.id, p.person_id, p.group_no, !p.lead))}
                          onRename={(p, name) => run(() => api.rosters.renameMember(data.roster.id, p.person_id, name))}
                          onRemove={(p) => run(() => api.rosters.removeMember(data.roster.id, p.person_id))} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {editable && <AddPerson kind={kind} busy={busy} onAdd={(name, group, lead) => run(() => api.rosters.addPerson(data.roster.id, name, group, lead))} />}
          </section>
        </>
      )}
    </div>
  );
}
