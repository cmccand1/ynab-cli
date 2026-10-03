import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api-client.js', () => ({
  client: { createTransaction: vi.fn() },
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
