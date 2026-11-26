import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Coins, Loader2, LogOut, RefreshCw, Sun, Moon, BedDouble, UserRound, Briefcase, Home } from "lucide-react";
import { api } from "@/api/db";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import JobCard from "@/components/porter/JobCard";
import PorterPasswordForm from "@/components/porter/PorterPasswordForm";
import { formatGHS } from "@/lib/packages";
import { currentPorterSession, forgetPorterSession, rememberPorterSession } from "@/lib/porterSession";
import { earningsSummary, longDayLabel, shiftsFrom, splitJobs } from "@/lib/porterDashboard";
import { notifyError } from "@/lib/notify";
import { toast } from "@/components/ui/use-toast";

const TABS = [
  { id: "today", label: "Today", icon: Home },
  { id: "shifts", label: "Shifts", icon: CalendarDays },
  { id: "jobs", label: "Jobs", icon: Briefcase },
  { id: "earnings", label: "Earnings", icon: Coins },
  { id: "account", label: "Me", icon: UserRound },
];
const SHIFT_ICON = { M: Sun, N: Moon, O: BedDouble };
const SHIFT_STYLE = { M: "bg-amber-500/15 text-amber-700", N: "bg-indigo-500/15 text-indigo-700", O: "bg-muted text-muted-foreground" };

// The porter's own screen: today's shift and jobs, the roster, all jobs, and earnings. A porter signs in with a phone number and
// password (not a staff account) and sees only their own work.
export default function PorterApp() {
  useDocumentTitle("Porter");
  const navigate = useNavigate();
  const [session, setSession] = useState(() => currentPorterSession());
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const signOut = useCallback(() => {
    forgetPorterSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  // Every request carries the signed session. If the backend says it has ended (password reset, login switched off), go back to sign in.
  const call = useCallback(
    async (action, extra = {}) => {
      try {
        const { data: out } = await api.functions.invoke("porterApp", { token: session?.token, action, ...extra });
        return out;
      } catch (err) {
        if (err.status === 401) {
          forgetPorterSession();
          navigate("/login", { replace: true, state: { notice: "Your porter session has ended. Please sign in again." } });
        }
        throw err;
      }
    },
    [session, navigate]
  );

  const load = useCallback(async () => {
    if (!session) return;
    setError("");
    try {
      setData(await call("overview"));
    } catch (err) {
      if (err.status !== 401) setError(err.message || "Could not load your page.");
    } finally {
      setLoading(false);
    }
  }, [session, call]);

  useEffect(() => {
    if (!session) navigate("/login", { replace: true });
    else load();
  }, [session, load, navigate]);

  // Coming back to the app after a while (a phone left in a pocket) shows fresh jobs.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const today = data?.today;
  const jobs = useMemo(() => splitJobs(data?.jobs, today), [data, today]);
  const shifts = useMemo(() => (today ? shiftsFrom(data?.rosters, today, 28) : []), [data, today]);
  const money = useMemo(() => earningsSummary(data?.earnings, today), [data, today]);

  const markDone = async (reference) => {
    try {
      await call("mark_done", { reference });
      await load();
    } catch (err) {
      if (err.status !== 401) notifyError(err.message || "Could not mark that job done.");
    }
  };

  const changePassword = async (values) => {
    const out = await call("change_password", values);
    rememberPorterSession({ token: out.token, expires_at: out.expires_at }, session.name);
    setSession(currentPorterSession());
    setLoading(true);
  };

  if (!session) return null;
  if (loading) {
    return <main className="min-h-screen grid place-items-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label="Loading" /></main>;
  }

  if (data?.must_change_password) {
    return (
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-sm mx-auto space-y-5">
          <header>
            <h1 className="text-xl font-semibold">Choose your own password</h1>
            <p className="text-sm text-muted-foreground mt-1">Welcome{data.porter?.name ? `, ${data.porter.name.split(" ")[0]}` : ""}. The office gave you a temporary password. Choose one only you know before you carry on.</p>
          </header>
          <PorterPasswordForm onSubmit={changePassword} />
          <button onClick={signOut} className="text-sm text-muted-foreground underline">Sign out</button>
        </div>
      </main>
    );
  }

  const first = (data?.porter?.name || session.name || "").split(" ")[0];
  const todayShift = shifts[0];
  const ShiftIcon = todayShift?.code ? SHIFT_ICON[todayShift.code] : null;
  const nextJob = jobs.upcoming[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Airport Assist Ghana</p>
            <h1 className="font-semibold truncate">{first ? `Hello, ${first}` : "Porter"}</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={load} aria-label="Refresh" className="w-11 h-11"><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-28 space-y-4">
        {error && <p role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</p>}

        {tab === "today" && (
          <>
            <p className="text-sm text-muted-foreground">{today && longDayLabel(today)}</p>
            <section className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4" aria-label="Your shift today">
              <span className={`grid place-items-center w-12 h-12 rounded-2xl ${SHIFT_STYLE[todayShift?.code] || SHIFT_STYLE.O}`}>
                {ShiftIcon ? <ShiftIcon className="w-6 h-6" aria-hidden="true" /> : <CalendarDays className="w-6 h-6" aria-hidden="true" />}
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Your shift today</p>
                <p className="text-lg font-semibold">{todayShift?.name || "No roster yet"}</p>
              </div>
            </section>
            <h2 className="text-sm font-semibold pt-1">Jobs today</h2>
            {jobs.today.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-4">
                No jobs for you today.{nextJob ? ` Your next one is ${longDayLabel(nextJob.flight_date)}.` : ""}
              </p>
            ) : (
              jobs.today.map((j) => <JobCard key={j.reference} job={j} today={today} onDone={markDone} />)
            )}
          </>
        )}

        {tab === "shifts" && (
          <>
            <h2 className="text-sm font-semibold">Your shifts, next four weeks</h2>
            {(data?.rosters || []).length === 0 && <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-4">You are not on a roster yet. The office adds porters to the monthly roster.</p>}
            <ul className="space-y-2">
              {shifts.map((s) => {
                const Icon = s.code ? SHIFT_ICON[s.code] : CalendarDays;
                return (
                  <li key={s.date} className={`flex items-center justify-between rounded-xl border border-border px-4 min-h-14 ${s.weekend ? "bg-muted/50" : "bg-card"}`}>
                    <span className="font-medium">{s.label}{s.date === today && <span className="ml-2 text-xs text-accent">Today</span>}</span>
                    <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full ${SHIFT_STYLE[s.code] || SHIFT_STYLE.O}`}><Icon className="w-4 h-4" aria-hidden="true" />{s.name}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {tab === "jobs" && (
          <>
            {["today", "upcoming", "recent"].map((k) => (
              <section key={k} className="space-y-3" aria-label={k}>
                <h2 className="text-sm font-semibold">{{ today: "Today", upcoming: "Coming up", recent: "Recent" }[k]}</h2>
                {jobs[k].length === 0 ? <p className="text-sm text-muted-foreground">Nothing here.</p> : jobs[k].map((j) => <JobCard key={j.reference} job={j} today={today} showDay={k !== "today"} onDone={markDone} />)}
              </section>
            ))}
          </>
        )}

        {tab === "earnings" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4"><p className="text-xs text-muted-foreground">Earned this month</p><p className="text-xl font-semibold mt-1">{formatGHS(money.monthEarned)}</p><p className="text-xs text-muted-foreground mt-1">{money.monthJobs} {money.monthJobs === 1 ? "job" : "jobs"}</p></div>
              <div className="bg-card border border-border rounded-2xl p-4"><p className="text-xs text-muted-foreground">Still to be paid</p><p className="text-xl font-semibold mt-1">{formatGHS(money.owed)}</p><p className="text-xs text-muted-foreground mt-1">last 90 days</p></div>
            </div>
            <p className="text-xs text-muted-foreground">Only jobs the supervisor has completed count. You are paid daily by the office.</p>
            <h2 className="text-sm font-semibold">Day by day</h2>
            {money.days.length === 0 ? <p className="text-sm text-muted-foreground">Nothing earned yet.</p> : (
              <ul className="space-y-2">
                {money.days.map((d) => (
                  <li key={d.date} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <div><p className="font-medium">{d.label}</p><p className="text-xs text-muted-foreground">{d.jobs} {d.jobs === 1 ? "job" : "jobs"} · {d.passengers} {d.passengers === 1 ? "passenger" : "passengers"}</p></div>
                    <div className="text-right"><p className="font-semibold">{formatGHS(d.earned)}</p><p className={`text-xs ${d.balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{d.balance > 0 ? `${formatGHS(d.balance)} to be paid` : "Paid"}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "account" && (
          <>
            <section className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="font-semibold">{data?.porter?.name}</p>
              <p className="text-sm text-muted-foreground">{data?.porter?.phone}</p>
            </section>
            <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-semibold">Change my password</h2>
              <PorterPasswordForm onSubmit={async (v) => { await changePassword(v); toast({ title: "Password changed" }); }} />
            </section>
            <Button variant="outline" className="w-full h-12" onClick={signOut}><LogOut className="w-4 h-4 mr-2" />Sign out</Button>
          </>
        )}
      </main>

      <nav aria-label="Porter pages" className="fixed bottom-0 inset-x-0 z-10 bg-background/95 backdrop-blur border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <ul className="max-w-lg mx-auto grid grid-cols-5">
          {TABS.map((t) => (
            <li key={t.id}>
              <button onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined} className={`w-full min-h-14 flex flex-col items-center justify-center gap-0.5 text-xs font-medium ${tab === t.id ? "text-accent" : "text-muted-foreground"}`}>
                <t.icon className="w-5 h-5" aria-hidden="true" />{t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
