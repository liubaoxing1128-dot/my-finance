// ==================== 账户类型 ====================
export type AccountType = 'bank' | 'cash' | 'alipay' | 'wechat' | 'other';

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  icon: string;
  color: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type CreateAccountInput = Omit<Account, 'id' | 'created_at' | 'updated_at'>;
export type UpdateAccountInput = Partial<CreateAccountInput>;

// ==================== 分类类型 ====================
export type CategoryKind = 'income' | 'expense';

export interface Category {
  id: number;
  name: string;
  type: CategoryKind;
  icon: string;
  color: string;
  parent_id: number | null;
  created_at: string;
}

// ==================== 交易类型 ====================
export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  description: string | null;
  date: string;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  created_at: string;
}

export type CreateTransactionInput = Omit<Transaction, 'id' | 'created_at'>;

// 交易列表项（带关联数据）
export interface TransactionWithDetails extends Transaction {
  account_name: string;
  account_icon: string;
  account_color: string;
  to_account_name?: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
}

// ==================== 储蓄目标类型 ====================
export type GoalStatus = 'active' | 'completed' | 'cancelled';

export interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
  color: string;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

export type CreateSavingsGoalInput = Omit<SavingsGoal, 'id' | 'current_amount' | 'created_at' | 'updated_at'>;

export interface SavingsDeposit {
  id: number;
  goal_id: number;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

// ==================== 预算类型 ====================
export interface Budget {
  id: number;
  category_id: number;
  amount: number;
  month: string; // 'YYYY-MM'
  spent: number;
  created_at: string;
}

export type CreateBudgetInput = Omit<Budget, 'id' | 'spent' | 'created_at'>;

export interface BudgetWithCategory extends Budget {
  category_name: string;
  category_icon: string;
  category_color: string;
}

// ==================== 仪表盘类型 ====================
export interface DashboardSummary {
  total_balance: number;
  monthly_income: number;
  monthly_expense: number;
  monthly_balance: number;
  savings_progress: number; // 0-100
  budget_usage: number;     // 0-100
}

export interface MonthlyTrend {
  month: string;
  income: number;
  expense: number;
}

export interface CategorySpending {
  name: string;
  amount: number;
  color: string;
}

// ==================== 基金类型 ====================
export type FundType = 'stock' | 'mix' | 'bond' | 'index' | 'qdi' | 'money' | 'other';

export const FundTypeLabels: Record<FundType, string> = {
  stock: '股票型', mix: '混合型', bond: '债券型', index: '指数型', qdi: 'QDII', money: '货币型', other: '其他',
};

// T+1（境内）还是 T+2（QDII 等）
export type SettlementType = 1 | 2;

export interface Fund {
  code: string;
  name: string;
  type: FundType;
  settlement: SettlementType;
  current_nav: number | null;
  nav_date: string | null;
  updated_at: string;
  created_at: string;
}

export interface FundHolding {
  id: number;
  fund_code: string;
  amount: number;
  nav_at_purchase: number;
  shares: number;
  sold_shares: number;
  fee: number;
  trade_time: string;
  settlement_date: string;
  date: string;
  note: string | null;
  created_at: string;
}

export interface FundHoldingWithFund extends FundHolding {
  fund_name: string;
  fund_type: FundType;
  current_nav: number | null;
  market_value: number | null;
  profit: number | null;
  profit_rate: number | null;
}

// ==================== 卖出类型 ====================
export interface FundSell {
  id: number;
  fund_code: string;
  shares: number;
  nav_at_sell: number;
  amount: number;
  fee: number;
  date: string;
  note: string | null;
  created_at: string;
}

export interface FundSellWithFund extends FundSell {
  fund_name: string;
  fund_type: FundType;
}

// ==================== 定投类型 ====================
export type InvestFrequency = 'weekly' | 'biweekly' | 'monthly';

export const InvestFrequencyLabels: Record<InvestFrequency, string> = {
  weekly: '每周', biweekly: '每两周', monthly: '每月',
};

export interface AutoInvest {
  id: number;
  fund_code: string;
  amount: number;
  frequency: InvestFrequency;
  account_id: number;
  next_date: string;
  status: 'active' | 'paused' | 'stopped';
  created_at: string;
  updated_at: string;
}

export interface AutoInvestWithFund extends AutoInvest {
  fund_name: string;
  fund_type: FundType;
  account_name: string;
  current_nav: number | null;
}

export interface FundSearchResult {
  code: string;
  name: string;
  type: FundType;
}

export interface FundSummary {
  total_invested: number;
  total_market_value: number;
  total_profit: number;
  total_profit_rate: number;
  fund_count: number;
}
