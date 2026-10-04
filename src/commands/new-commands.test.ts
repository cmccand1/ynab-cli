import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api-client.js', () => ({
  client: {
    getAccount: vi.fn(),
    getTransactionsByAccount: vi.fn(),
    getTransactions: vi.fn(),
    updateTransactions: vi.fn(),
    createTransaction: vi.fn(),
    getCategories: vi.fn(),
    createCategory: vi.fn(),
    getScheduledTransaction: vi.fn(),
    updateScheduledTransaction: vi.fn(),
    deleteScheduledTransaction: vi.fn(),
    getPayees: vi.fn(),
  },
}));

vi.mock('../lib/output.js', () => ({ outputJson: vi.fn(), outputError: vi.fn() }));

import { client } from '../lib/api-client.js';
import { outputError, outputJson } from '../lib/output.js';
import { createAccountsCommand } from './accounts.js';
import { createTransactionsCommand } from './transactions.js';
import { createCategoriesCommand } from './categories.js';
import { createScheduledCommand } from './scheduled.js';

const mock = client as unknown as Record<string, ReturnType<typeof vi.fn>>;
const out = outputJson as ReturnType<typeof vi.fn>;
const err = outputError as ReturnType<typeof vi.fn>;

async function expectCliError(run: () => Promise<unknown>, statusCode: number) {
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });
  await expect(run()).rejects.toThrow('process.exit');
  expect(err).toHaveBeenCalledWith(expect.objectContaining({ statusCode }));
  exit.mockRestore();
}

beforeEach(() => vi.clearAllMocks());

describe('ynab accounts reconcile', () => {
  const run = (...args: string[]) =>
    createAccountsCommand().parseAsync(['node', 'accounts', 'reconcile', 'acct', ...args]);

  beforeEach(() => {
    mock.getAccount.mockResolvedValue({ name: 'Checking', cleared_balance: 100000 });
    mock.getTransactionsByAccount.mockResolvedValue({
      transactions: [
        { id: 'a', cleared: 'cleared', deleted: false },
        { id: 'b', cleared: 'uncleared', deleted: false },
        { id: 'c', cleared: 'reconciled', deleted: false },
      ],
    });
  });

  it('marks only cleared transactions reconciled when the balance matches', async () => {
    await run('--balance', '100');
    expect(mock.updateTransactions).toHaveBeenCalledWith(
      { transactions: [{ id: 'a', cleared: 'reconciled' }] },
      undefined
    );
    expect(mock.createTransaction).not.toHaveBeenCalled();
  });

  it('refuses a mismatched balance without --adjust and writes nothing', async () => {
    await expectCliError(() => run('--balance', '90'), 409);
    expect(mock.updateTransactions).not.toHaveBeenCalled();
  });

  it('writes nothing on --dry-run', async () => {
    await run('--balance', '100', '--dry-run');
    expect(mock.updateTransactions).not.toHaveBeenCalled();
    expect(out).toHaveBeenCalledWith(expect.objectContaining({ transactions_to_reconcile: 1, dry_run: true }));
  });

  it('records the difference as an adjustment with --adjust', async () => {
    mock.getCategories.mockResolvedValue({
      category_groups: [{ name: 'Internal Master Category', categories: [{ id: 'rta', name: 'Inflow: Ready to Assign' }] }],
    });
    mock.createTransaction.mockResolvedValue({ id: 'adj' });
    await run('--balance', '90', '--adjust');
    const [body] = mock.createTransaction.mock.calls[0];
    expect(body.transaction).toMatchObject({ amount: -10000, category_id: 'rta', cleared: 'reconciled' });
  });
});

describe('ynab transactions approve', () => {
  const run = (...args: string[]) =>
    createTransactionsCommand().parseAsync(['node', 'transactions', 'approve', ...args]);

  it('requires IDs, a filter, or --all', async () => {
    await expectCliError(() => run(), 400);
    expect(mock.updateTransactions).not.toHaveBeenCalled();
  });

  it('approves unapproved transactions up to --until', async () => {
    mock.getTransactions.mockResolvedValue({
      transactions: [
        { id: 'a', date: '2026-09-01', approved: false, deleted: false },
        { id: 'b', date: '2026-10-02', approved: false, deleted: false },
      ],
    });
    await run('--since', '2026-09-01', '--until', '2026-09-30');
    expect(mock.updateTransactions).toHaveBeenCalledWith(
      { transactions: [{ id: 'a', approved: true }] },
      undefined
    );
  });

  it('writes nothing on --dry-run', async () => {
    mock.getTransactions.mockResolvedValue({ transactions: [{ id: 'a', date: '2026-09-01', approved: false }] });
    await run('--all', '--dry-run');
    expect(mock.updateTransactions).not.toHaveBeenCalled();
  });
});

describe('ynab categories create', () => {
  const run = (...args: string[]) =>
    createCategoriesCommand().parseAsync(['node', 'categories', 'create', ...args]);

  beforeEach(() => {
    mock.getCategories.mockResolvedValue({
      category_groups: [{ id: 'g1', name: 'Subs', deleted: false, categories: [{ id: 'c1', name: 'Existing', deleted: false }] }],
    });
  });

  it('creates a category in a group found by name', async () => {
    await run('--name', 'New', '--group', 'Subs', '--note', 'hi');
    expect(mock.createCategory).toHaveBeenCalledWith(
      { category: { name: 'New', category_group_id: 'g1', note: 'hi' } },
      undefined
    );
  });

  it('refuses a duplicate name in the same group', async () => {
    await expectCliError(() => run('--name', 'Existing', '--group', 'Subs'), 409);
    expect(mock.createCategory).not.toHaveBeenCalled();
  });
});

describe('ynab scheduled', () => {
  const run = (...args: string[]) => createScheduledCommand().parseAsync(['node', 'scheduled', ...args]);

  it('update keeps unspecified fields and resolves --payee-name to an existing payee', async () => {
    mock.getScheduledTransaction.mockResolvedValue({
      account_id: 'acct', date_next: '2026-10-07', amount: -18990, frequency: 'monthly',
      payee_id: 'old', category_id: 'cat', memo: null, flag_color: null, deleted: false,
    });
    mock.getPayees.mockResolvedValue({ payees: [{ id: 'yt', name: 'YouTube Premium', deleted: false }] });
    await run('update', 's1', '--amount', '-29', '--payee-name', 'YouTube Premium');
    const [, body] = mock.updateScheduledTransaction.mock.calls[0];
    expect(body.scheduled_transaction).toMatchObject({
      account_id: 'acct', date: '2026-10-07', amount: -29000, frequency: 'monthly', payee_id: 'yt', category_id: 'cat',
    });
  });

  it('delete fails loudly when the schedule is still there afterwards', async () => {
    mock.deleteScheduledTransaction.mockResolvedValue({ id: 's1' });
    mock.getScheduledTransaction.mockResolvedValue({ id: 's1', deleted: false });
    await expectCliError(() => run('delete', 's1', '--yes'), 409);
  });
});
