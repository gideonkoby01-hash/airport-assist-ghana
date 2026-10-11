import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export default function StaffRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [processing, setProcessing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const items = await base44.entities.AccountRequest.filter(
        { status: filter },
        { sort: "-created_date", limit: 100 }
      );
      const list = Array.isArray(items) ? items : (items?.items || []);
      setRequests(list);
    } catch (e) {
      toast({
        title: "Error",
        description: e.message || "Failed to load requests",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const process = async (id, action) => {
    setProcessing(id + action);
    try {
      const res = await base44.functions.invoke("processStaffRequest", {
        request_id: id,
        action,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      toast({
        title: action === "approve" ? "Request approved" : "Request rejected",
        description:
          action === "approve"
            ? "The applicant can now access their staff dashboard."
            : "The applicant will see the rejection on their next sign-in.",
      });
      load();
    } catch (e) {
      toast({
        title: "Error",
        description: e.message || "Failed to process request",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Staff Access Requests
        </h3>
        <div className="flex gap-2 flex-wrap mb-4">
          {["pending", "approved", "rejected"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                filter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center text-muted-foreground text-sm py-6">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading requests…
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No {filter} requests.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Submitted</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 font-medium">
                      {r.full_name || "—"}
                    </td>
                    <td className="py-3 pr-4">{r.email}</td>
                    <td className="py-3 pr-4 capitalize">
                      {r.requested_role}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {r.created_date
                        ? new Date(r.created_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          r.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : r.status === "approved"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {r.status === "pending" ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => process(r.id, "approve")}
                            disabled={processing === r.id + "approve"}
                          >
                            {processing === r.id + "approve" ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3 mr-1" />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => process(r.id, "reject")}
                            disabled={processing === r.id + "reject"}
                          >
                            {processing === r.id + "reject" ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <X className="w-3 h-3 mr-1" />
                            )}
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}