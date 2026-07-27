'use client';

import { create } from 'zustand';
import type { Account, Category, TransactionWithDetails, SavingsGoal, BudgetWithCategory, DashboardSummary, MonthlyTrend, CategorySpending } from '@/types';

interface AppState {
  // 数据
  accounts: Account[];
  categories: Category[];
  transactions: TransactionWithDetails[];
  savingsGoals: SavingsGoal[];
  budgets: BudgetWithCategory[];
  dashboard: DashboardSummary | null;
  monthlyTrends: MonthlyTrend[];
  categorySpendings: CategorySpending[];

  // 加载状态
  loading: boolean;

  // 操作
  setAccounts: (accounts: Account[]) => void;
  setCategories: (categories: Category[]) => void;
  setTransactions: (txns: TransactionWithDetails[]) => void;
  setSavingsGoals: (goals: SavingsGoal[]) => void;
  setBudgets: (budgets: BudgetWithCategory[]) => void;
  setDashboard: (data: DashboardSummary) => void;
  setMonthlyTrends: (data: MonthlyTrend[]) => void;
  setCategorySpendings: (data: CategorySpending[]) => void;

  // 刷新
  refreshAll: () => Promise<void>;
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

  setAccounts: (accounts) => set({ accounts }),
  setCategories: (categories) => set({ categories }),
  setTransactions: (transactions) => set({ transactions }),
  setSavingsGoals: (savingsGoals) => set({ savingsGoals }),
  setBudgets: (budgets) => set({ budgets }),
  setDashboard: (dashboard) => set({ dashboard }),
  setMonthlyTrends: (monthlyTrends) => set({ monthlyTrends }),
  setCategorySpendings: (categorySpendings) => set({ categorySpendings }),

  refreshAll: async () => {
    set({ loading: true });
    try {
      const [accounts, categories, transactions, goals, budgets, dashboard, trends, spendings] =
        await Promise.all([
          fetch('/api/accounts').then(r => r.json()),
          fetch('/api/categories').then(r => r.json()),
          fetch('/api/transactions').then(r => r.json()),
          fetch('/api/savings').then(r => r.json()),
          fetch('/api/budget').then(r => r.json()),
          fetch('/api/dashboard').then(r => r.json()),
          fetch('/api/dashboard?type=trends').then(r => r.json()),
          fetch('/api/dashboard?type=spendings').then(r => r.json()),
        ]);

      set({
        accounts: accounts.data || [],
        categories: categories.data || [],
        transactions: transactions.data || [],
        savingsGoals: goals.data || [],
        budgets: budgets.data || [],
        dashboard: dashboard.data || null,
        monthlyTrends: trends.data || [],
        categorySpendings: spendings.data || [],
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
}));
