'use client';

import { create } from 'zustand';
import type { Account, Category, TransactionWithDetails, SavingsGoal, BudgetWithCategory, DashboardSummary, MonthlyTrend, CategorySpending } from '@/types';
import {
  getDashboard, getMonthlyTrends, getCategorySpendings,
  getAccounts, getCategories, getTransactions, getSavingsGoals, getBudgets,
  getAllFunds, getFundHoldings, getAutoInvests,
} from '@/lib/db-ops';

interface AppState {
  accounts: Account[];
  categories: Category[];
  transactions: TransactionWithDetails[];
  savingsGoals: SavingsGoal[];
  budgets: BudgetWithCategory[];
  dashboard: DashboardSummary | null;
  monthlyTrends: MonthlyTrend[];
  categorySpendings: CategorySpending[];
  loading: boolean;
  refreshAll: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  accounts: [],
  categories: [],
  transactions: [],
  savingsGoals: [],
  budgets: [],
  dashboard: null,
  monthlyTrends: [],
  categorySpendings: [],
  loading: false,

  refreshAll: () => {
    set({ loading: true });
    try {
      const accounts = getAccounts() as unknown as Account[];
      const categories = getCategories() as unknown as Category[];
      const transactions = getTransactions() as unknown as TransactionWithDetails[];
      const savingsGoals = getSavingsGoals() as unknown as SavingsGoal[];
      const budgets = getBudgets(new Date().toISOString().slice(0, 7)) as unknown as BudgetWithCategory[];
      const dashboard = getDashboard() as unknown as DashboardSummary;
      const monthlyTrends = getMonthlyTrends() as unknown as MonthlyTrend[];
      const categorySpendings = getCategorySpendings() as unknown as CategorySpending[];

      set({
        accounts, categories, transactions, savingsGoals, budgets,
        dashboard, monthlyTrends, categorySpendings,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
}));
