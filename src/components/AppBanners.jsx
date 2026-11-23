import React, { useState } from "react";
import { Download, RefreshCw, Share, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IOS_STEPS } from "@/lib/pwa";
import { useAppStatus } from "@/hooks/use-app-status";

// The messages that make the back office behave like an app on a phone: you are offline, a newer version is ready, and (until it
// is installed) an offer to put it on the Home Screen. The install offer is for phones and tablets only.
export default function AppBanners() {
  const { online, updateReady, update, installMode, install, dismiss } = useAppStatus();
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className="space-y-3 empty:hidden mb-4">
      {!online && (
        <p role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          <WifiOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span><strong className="font-semibold">You are offline.</strong> You can read what is already on screen. Anything you save will not go through until the connection is back.</span>
        </p>
      )}

      {updateReady && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2.5">
          <p className="text-sm text-foreground"><strong className="font-semibold">A new version is ready.</strong> Refresh to get the latest.</p>
          <Button size="sm" onClick={update}><RefreshCw className="w-4 h-4 mr-1.5" aria-hidden="true" /> Refresh</Button>
        </div>
      )}

      {(installMode === "prompt" || installMode === "ios") && (
        <section aria-label="Install the app" className="lg:hidden rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <img src="/icons/icon-192.png" alt="" width="44" height="44" className="rounded-xl shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Put Airport Assist on your phone</p>
              <p className="text-sm text-muted-foreground mt-0.5">Opens full screen like an app, starts faster, and still opens when the signal is poor.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {installMode === "prompt" ? (
                  <Button size="sm" onClick={install}><Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Install the app</Button>
                ) : (
                  <Button size="sm" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}><Share className="w-4 h-4 mr-1.5" aria-hidden="true" /> {showSteps ? "Hide the steps" : "Show me how"}</Button>
                )}
                <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
              </div>
              {installMode === "ios" && showSteps && (
                <>
                  <ol className="mt-3 space-y-1.5 text-sm text-foreground list-decimal pl-5">
                    {IOS_STEPS.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                  <p className="mt-2 text-xs text-muted-foreground">Do not see Share? Open this page in Safari first.</p>
                </>
              )}
            </div>
            <button type="button" onClick={dismiss} aria-label="Close" className="-mr-1 -mt-1 p-1.5 rounded-lg text-muted-foreground hover:text-foreground"><X className="w-4 h-4" aria-hidden="true" /></button>
          </div>
        </section>
      )}
    </div>
  );
}
