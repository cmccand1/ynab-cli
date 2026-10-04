import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api-client.js', () => ({
  client: {
    createTransaction: vi.fn(),
    createTransactions: vi.fn(),
    getAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
  },
}));

vi.mock('../lib/output.js', () => ({
  outputJson: vi.fn(),
  outputError: vi.fn(),
}));

import { client } from '../lib/api-client.js';
import { outputError } from '../lib/output.js';
import { createTransactionsCommand } from './transactions.js';

const mockCreateTransaction = client.createTransaction as ReturnType<typeof vi.fn>;
const mockOutputError = outputError as ReturnType<typeof vi.fn>;
const mockCreateTransactions = client.createTransactions as ReturnType<typeof vi.fn>;

describe('ynab transactions create --import-id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTransaction.mockResolvedValue({ id: 'new-transaction-id' });
  });

  async function runCreate(...args: string[]) {
    await createTransactionsCommand().parseAsync([
      'node',
      'transactions',
      'create',
      '--account',
      'account-id',
      '--amount',
      '-12.50',
      '--date',
      '2026-10-01',
      ...args,
    ]);
  }

  it('sends the import ID to the API', async () => {
    await runCreate('--import-id', 'venmo:5WR74964H97182534');

    const [body] = mockCreateTransaction.mock.calls[0];
    expect(body.transaction).toMatchObject({
      account_id: 'account-id',
      amount: -12500,
      import_id: 'venmo:5WR74964H97182534',
    });
  });

  it('leaves import_id unset when the flag is not given', async () => {
    await runCreate();

    const [body] = mockCreateTransaction.mock.calls[0];
    expect(body.transaction.import_id).toBeUndefined();
  });

  it('rejects an import ID longer than 36 characters without calling the API', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(runCreate('--import-id', 'x'.repeat(37))).rejects.toThrow('process.exit');

    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cli_error', statusCode: 400 })
    );
    exit.mockRestore();
  });
});

describe('ynab transactions batch-create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTransactions.mockResolvedValue({
      transaction_ids: [],
      duplicate_import_ids: [],
      transactions: [],
    });
  });

  async function runBatchCreate(transactions: unknown) {
    await createTransactionsCommand().parseAsync([
      'node',
      'transactions',
      'batch-create',
      '--transactions',
      JSON.stringify(transactions),
    ]);
  }

  it('sends every transaction in one request with amounts in milliunits', async () => {
    await runBatchCreate([
      {
        account_id: 'venmo',
        date: '2026-08-12',
        amount: -27,
        payee_name: 'Celeste Holloman',
        memo: 'Doggie lawn',
        import_id: 'venmo:5WR74964H97182534',
      },
      { account_id: 'venmo', date: '2026-08-13', amount: 43, category_id: 'rta', import_id: 'venmo:6XY' },
    ]);

    expect(mockCreateTransactions).toHaveBeenCalledOnce();
    const [body] = mockCreateTransactions.mock.calls[0];
    expect(body.transactions).toEqual([
      {
        account_id: 'venmo',
        date: '2026-08-12',
        amount: -27000,
        payee_name: 'Celeste Holloman',
        memo: 'Doggie lawn',
        import_id: 'venmo:5WR74964H97182534',
      },
      { account_id: 'venmo', date: '2026-08-13', amount: 43000, category_id: 'rta', import_id: 'venmo:6XY' },
    ]);
  });

  it.each([
    ['an empty array', []],
    ['a missing amount', [{ account_id: 'venmo', date: '2026-08-12' }]],
    ['an invalid date', [{ account_id: 'venmo', date: 'notadate', amount: -1 }]],
    [
      'an import_id over 36 characters',
      [{ account_id: 'venmo', date: '2026-08-12', amount: -1, import_id: 'x'.repeat(37) }],
    ],
  ])('rejects %s without calling the API', async (_label, transactions) => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(runBatchCreate(transactions)).rejects.toThrow('process.exit');

    expect(mockCreateTransactions).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    exit.mockRestore();
  });
});
