import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseNumberOption } from '../lib/command-utils.js';
import { YnabCliError } from '../lib/errors.js';
import { amountToMilliunits, applyFieldSelection, milliunitsToAmount } from '../lib/utils.js';
import { parseDate, todayDate } from '../lib/dates.js';

const UPDATE_CHUNK = 500;
import type { CommandOptions } from '../types/index.js';

export function createAccountsCommand(): Command {
  const cmd = new Command('accounts').description('Account operations');

  cmd
    .command('list')
    .description('List all accounts')
    .option('-b, --budget <id>', 'Budget ID')
    .action(
      withErrorHandling(async (options: CommandOptions) => {
        const result = await client.getAccounts(options.budget);
        outputJson(result?.accounts);
      })
    );

  cmd
    .command('view')
    .description('View account details')
    .argument('<id>', 'Account ID')
    .option('-b, --budget <id>', 'Budget ID')
    .action(
      withErrorHandling(async (id: string, options: CommandOptions) => {
        const account = await client.getAccount(id, options.budget);
        outputJson(account);
      })
    );

  cmd
    .command('transactions')
    .description('List transactions for account')
    .argument('<id>', 'Account ID')
    .option('-b, --budget <id>', 'Budget ID')
    .option('--since <date>', 'Filter transactions since date')
    .option('--type <type>', 'Filter by transaction type: uncategorized or unapproved')
    .option(
      '--fields <fields>',
      'Comma-separated list of fields to include (e.g., id,date,amount,memo)'
    )
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            budget?: string;
            since?: string;
            type?: string;
            fields?: string;
          } & CommandOptions
        ) => {
          const result = await client.getTransactionsByAccount(id, {
            budgetId: options.budget,
            sinceDate: options.since ? parseDate(options.since) : undefined,
            type: options.type,
          });
          const transactions = result?.transactions || [];
          outputJson(applyFieldSelection(transactions, options.fields));
        }
      )
    );

  cmd
    .command('reconcile')
    .description(
      'Reconcile an account against its real balance: check that YNAB\'s cleared balance equals it, ' +
        'then mark every cleared transaction reconciled. Uncleared (pending) transactions are left alone. ' +
        "YNAB's last-reconciled date can only be set by pressing Reconcile in the YNAB app.\n\n" +
        'Examples:\n' +
        '  ynab accounts reconcile <id> --balance 1144.79 --dry-run\n' +
        '  ynab accounts reconcile <card-id> --balance -2965.38\n' +
        '  ynab accounts reconcile <id> --balance 100 --adjust'
    )
    .argument('<id>', 'Account ID')
    .requiredOption(
      '--balance <amount>',
      'Real cleared balance from the bank, in dollars (negative for money owed on a card)',
      parseNumberOption
    )
    .option(
      '--adjust',
      'If the cleared balance differs, record the difference as a "Reconciliation Balance Adjustment" in Ready to Assign'
    )
    .option('--dry-run', 'Report what would change without writing anything')
    .option('-b, --budget <id>', 'Budget ID')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: { balance: number; adjust?: boolean; dryRun?: boolean } & CommandOptions
        ) => {
          const account = await client.getAccount(id, options.budget);
          const target = amountToMilliunits(options.balance);
          const difference = target - account.cleared_balance;

          const { transactions } = await client.getTransactionsByAccount(id, { budgetId: options.budget });
          const toReconcile = transactions.filter((t) => !t.deleted && t.cleared === 'cleared');

          const summary = {
            account: account.name,
            statement_balance: options.balance,
            cleared_balance_before: milliunitsToAmount(account.cleared_balance),
            difference: milliunitsToAmount(difference),
            transactions_to_reconcile: toReconcile.length,
          };

          if (difference !== 0 && !options.adjust) {
            throw new YnabCliError(
              `Cleared balance ${summary.cleared_balance_before} does not match ${options.balance} ` +
                `(difference ${summary.difference}). Find the transactions causing it, or rerun with --adjust ` +
                'to record the difference as a balance adjustment.',
              409
            );
          }

          if (options.dryRun) {
            outputJson({ ...summary, adjustment_needed: difference !== 0, dry_run: true });
            return;
          }

          let adjustmentId: string | undefined;
          if (difference !== 0) {
            const { category_groups } = await client.getCategories(options.budget);
            const readyToAssign = category_groups
              .find((g) => g.name === 'Internal Master Category')
              ?.categories.find((c) => c.name.startsWith('Inflow'));
            const created = await client.createTransaction(
              {
                transaction: {
                  account_id: id,
                  date: todayDate(),
                  amount: difference,
                  payee_name: 'Reconciliation Balance Adjustment',
                  category_id: readyToAssign?.id,
                  memo: 'Entered by ynab accounts reconcile',
                  cleared: 'reconciled',
                  approved: true,
                },
              },
              options.budget
            );
            adjustmentId = created?.id;
          }

          for (let i = 0; i < toReconcile.length; i += UPDATE_CHUNK) {
            await client.updateTransactions(
              {
                transactions: toReconcile
                  .slice(i, i + UPDATE_CHUNK)
                  .map((t) => ({ id: t.id, cleared: 'reconciled' as const })),
              },
              options.budget
            );
          }

          outputJson({
            ...summary,
            adjustment_transaction_id: adjustmentId ?? null,
            reconciled: toReconcile.length,
            note: 'Press Reconcile in the YNAB app to record the reconciliation date.',
          });
        }
      )
    );

  return cmd;
}
