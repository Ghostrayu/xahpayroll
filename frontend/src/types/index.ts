// Core Types for XahPayroll

export interface WalletState {
  address: string | null;
  balance: number;
  isConnected: boolean;
}

export interface WorkSession {
  id: string;
  workerId: string;
  startTime: Date;
  endTime?: Date;
  hourlyRate: number;
  totalHours: number;
  totalPaid: number;
  status: 'active' | 'completed' | 'timeout';
}

export interface Payment {
  id: string;
  workerId: string;
  amount: number;
  timestamp: Date;
  transactionHash: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface Worker {
  id: string;
  walletAddress: string;
  name: string;
  hourlyRate: number;
  totalHoursWorked: number;
  totalEarned: number;
  status: 'active' | 'inactive';
}

export interface Employer {
  id: string;
  walletAddress: string;
  organizationName: string;
  escrowBalance: number;
  totalWorkers: number;
}

export type UserRole = 'worker' | 'employer' | 'ngo';

export interface Feature {
  icon: string;
  title: string;
  description: string;
}

export interface Stat {
  label: string;
  value: string;
  icon: string;
}
