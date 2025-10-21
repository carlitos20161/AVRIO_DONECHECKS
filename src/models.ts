export interface Company {
  id: string;
  name: string;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  companyId: string;
  active: boolean;
  miscellaneous?: boolean;
}

export interface Employee {
  id: string;
  name: string;
  address: string;
  position: string;
  payRate: number;
  payType: string;
  payTypes: string[];
  companyId?: string | null;
  companyIds?: string[];
  clientId?: string | null; // Legacy field - keeping for backward compatibility
  clientPayTypeRelationships?: ClientPayTypeRelationship[]; // New field for multiple relationships
  active: boolean;
  startDate?: string | null;
  hasMultipleClients?: boolean; // New field to indicate if employee has multiple client relationships
}

export interface ClientPayTypeRelationship {
  id: string;
  clientId: string;
  clientName: string;
  payType: 'hourly' | 'perdiem';
  payRate?: string; // Pay rate for hourly relationships
  active: boolean;
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'standard';
  active: boolean;
}

export interface Check {
  id: string;
  employeeId: string;
  clientId: string | null;
  companyId: string;
  amount: number;
  date: string; // ISO date
  memo?: string;
  testPrint?: boolean;
  selectedRelationshipIds?: string[];
  relationshipDetails?: Array<{
    id: string;
    clientId: string;
    clientName: string;
    payType: string;
  }>;
} 