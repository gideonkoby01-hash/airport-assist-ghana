import React from "react";
import { Loader2 } from "lucide-react";

export default function LazyFallback() {
  return <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</div>;
}
