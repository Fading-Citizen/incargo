import type { Delivery, Trip } from "./model";
export type Account = { account_id: string; display_name: string };
export type AccessRequest = {
  user_id: string;
  email: string;
  company_claim: string;
  updated_at: string;
};
export type DeliveryDetail = {
  events: {
    id: string;
    event_type: string;
    note?: string;
    occurred_at: string;
  }[];
  proof: null | {
    receiver_name: string;
    observation?: string;
    captured_at: string;
  };
  links: { id: string; expires_at: string; revoked_at?: string }[];
};
export interface OperationsApi {
  businessCapabilities(): Promise<{
    commercial: boolean;
    finance: boolean;
    lifecycle?: boolean;
  }>;
  quoteBoard(): Promise<import("./business").Quote[]>;
  orderBoard(): Promise<import("./business").Order[]>;
  receiptBoard(): Promise<import("./business").Receipt[]>;
  financeBoard(): Promise<import("./business").Invoice[]>;
  invoiceDetail(id: string): Promise<import("./business").InvoiceDetail>;
  createQuote(request: string, data: Record<string, unknown>): Promise<string>;
  reviseQuote(
    request: string,
    id: string,
    reason: string,
    data: Record<string, unknown>,
  ): Promise<string>;
  cancelOrder(request: string, id: string, reason: string): Promise<string>;
  administrativeNotes(
    type: string,
    id: string,
  ): Promise<import("./business").AdministrativeNote[]>;
  addAdministrativeNote(
    request: string,
    type: string,
    id: string,
    body: string,
    source: string,
  ): Promise<string>;
  acceptQuote(request: string, id: string, reference: string): Promise<string>;
  linkOrderDelivery(
    request: string,
    order: string,
    delivery: string,
  ): Promise<string>;
  registerInvoice(
    request: string,
    data: Record<string, unknown>,
  ): Promise<string>;
  recordReceipt(
    request: string,
    data: Record<string, unknown>,
  ): Promise<string>;
  applyReceipt(
    request: string,
    receipt: string,
    invoice: string,
    amount: number,
  ): Promise<string>;
  reverseAllocation(
    request: string,
    id: string,
    reason: string,
  ): Promise<string>;

  refresh(): Promise<void>;
  refreshMonitor(): Promise<void>;
  createTrip(input: Omit<Trip, "id"> & { request_id: string }): Promise<void>;
  assignTrip(id: string, driver: string): Promise<void>;
  createDelivery(
    input: Omit<Delivery, "id" | "status"> & { request_id: string },
  ): Promise<void>;
  startDelivery(id: string): Promise<void>;
  detail(id: string): Promise<DeliveryDetail>;
  proof(id: string): Promise<Blob>;
  tracking(id: string): Promise<string>;
  revokeTracking(id: string): Promise<void>;
  accounts(): Promise<Account[]>;
  requests(): Promise<AccessRequest[]>;
  createAccount(name: string): Promise<string>;
  linkUser(account: string, user: string): Promise<void>;
  assignClientDelivery(account: string, delivery: string): Promise<void>;
  unlinkUser(user: string): Promise<void>;
  unassignClientDelivery(delivery: string): Promise<void>;
  approveRequest(
    user: string,
    account: string,
    updatedAt: string,
  ): Promise<void>;
}
declare global {
  interface Window {
    IncargoOperations: OperationsApi;
  }
}
export const api = () => window.IncargoOperations;
