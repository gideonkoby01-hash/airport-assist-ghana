import React from "react";
import { useSearchParams } from "react-router-dom";
import CustomerList from "@/components/crm/CustomerList";
import CustomerDetail from "@/components/crm/CustomerDetail";

// Customers inside the Admin and Management dashboards: the list, or one customer when ?customer=<id> is set.
export default function CustomersPanel({ tab = "customers", isAdmin = false }) {
  const [params, setParams] = useSearchParams();
  const customerId = params.get("customer");
  const open = (id) => setParams({ tab, customer: id });
  const back = () => setParams({ tab });
  return customerId ? (
    <CustomerDetail id={customerId} isAdmin={isAdmin} onBack={back} />
  ) : (
    <CustomerList onOpen={open} />
  );
}
