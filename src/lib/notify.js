import { toast } from "@/components/ui/use-toast";

// Shows a problem as a message on the page instead of a blocking browser alert().
export function notifyError(message) {
  toast({ title: "That didn't work", description: String(message), variant: "destructive" });
}
