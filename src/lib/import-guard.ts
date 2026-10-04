import { client } from './api-client.js';
import { YnabCliError } from './errors.js';

interface NewTransaction {
  account_id?: unknown;
  import_id?: unknown;
}

/**
 * YNAB never merges a bank-feed import into a transaction that already has an import_id, so an
 * import_id on a linked account guarantees a duplicate once the feed imports the same transaction.
 * Refuse unless the caller opts in.
 */
export async function assertNoImportIdsOnLinkedAccounts(
  transactions: NewTransaction[],
  budgetId?: string
): Promise<void> {
  const withImportId = transactions.filter((t) => typeof t.import_id === 'string' && t.import_id !== '');
  if (withImportId.length === 0) return;

  const { accounts } = await client.getAccounts(budgetId);
  const linked = new Map(accounts.filter((a) => a.direct_import_linked).map((a) => [a.id, a.name]));
  const names = [...new Set(withImportId.map((t) => linked.get(t.account_id as string)).filter(Boolean))];
  if (names.length === 0) return;

  throw new YnabCliError(
    `${names.map((n) => `"${n}"`).join(', ')} ${names.length === 1 ? 'is' : 'are'} linked to a bank feed. ` +
      "YNAB never merges the feed's copy of a transaction into one that has an import_id, so it would " +
      'appear twice. Leave out the import_id (check for an existing row first instead), or pass ' +
      '--allow-linked-import-id if the feed will never import this transaction.',
    400
  );
}
