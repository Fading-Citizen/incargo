export type ChargeLine = {
  description: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
};
export type Quote = {
  id: string;
  account_id: string;
  currency: string;
  origin_text: string;
  destination_text: string;
  description: string;
  lines: ChargeLine[];
  total: number;
  created_at: string;
  accepted_at?: string;
};
export type Order = {
  id: string;
  quote_id: string;
  account_id: string;
  customer: string;
  created_at: string;
  origin_text: string;
  destination_text: string;
  description: string;
  currency: string;
  total: number;
  execution_stage: string;
  deliveries: { id: string; trip_id: string; status: string }[];
};
export type Invoice = {
  id: string;
  account_id: string;
  customer: string;
  external_number: string;
  issuer_reference: string;
  currency: string;
  issue_date: string;
  due_date: string;
  total: number;
  outstanding: number;
};
export type InvoiceDetail = {
  invoice: Invoice & { lines: ChargeLine[]; source_reference: string };
  allocations: {
    id: string;
    amount: number;
    receipt_id: string;
    reversed_at?: string;
    reversal_reason?: string;
  }[];
  audit: { event: string; occurred_at: string }[];
};
export function money(value: number, currency: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export type Receipt = {
  id: string;
  account_id: string;
  customer: string;
  currency: string;
  amount: number;
  external_reference: string;
  received_date: string;
  available: number;
};
