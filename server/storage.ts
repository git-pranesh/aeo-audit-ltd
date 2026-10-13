import { type AuditData, type AuditRequest } from "@shared/schema";

// Storage interface for audit data
export interface IStorage {
  // In-memory storage - no persistence needed for this demo
  // Could be extended to store audit history if needed
}

export class MemStorage implements IStorage {
  constructor() {
    // No storage needed for this audit-only application
  }
}

export const storage = new MemStorage();
