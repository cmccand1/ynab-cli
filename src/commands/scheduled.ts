import { Command, InvalidArgumentError } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { YnabCliError } from '../lib/errors.js';
import {
  withErrorHandling,
  requireConfirmation,
  parseIntegerOption,
  parseNumberOption,
} from '../lib/command-utils.js';
import { amountToMilliunits } from '../lib/utils.js';
import { parseDate } from '../lib/dates.js';
import type { CommandOptions } from '../types/index.js';

const FREQUENCIES = [
  'never', 'daily', 'weekly', 'everyOtherWeek', 'twiceAMonth', 'every4Weeks', 'monthly',
  'everyOtherMonth', 'every3Months', 'every4Months', 'twiceAYear', 'yearly', 'everyOtherYear',
] as const;
type Frequency = (typeof FREQUENCIES)[number];

function parseFrequency(value: string): Frequency {
  if (!(FREQUENCIES as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(`Must be one of: ${FREQUENCIES.join(', ')}.`);
  }
  return value as Frequency;
}

interface ScheduleOptions {
  account?: string;
  date?: string;
  amount?: number;
  frequency?: Frequency;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  memo?: string;
  flagColor?: string;
  budget?: string;
}

/**
 * YNAB keeps a schedule's existing payee unless a payee_id is sent, so a
 * --payee-name is resolved to an existing payee's ID when one matches exactly.
 */
async function payeeFields(options: ScheduleOptions): Promise<Record<string, string> | undefined> {
  if (options.payeeId) return { payee_id: options.payeeId };
  if (!options.payeeName) return undefined;
  const { payees } = await client.getPayees(options.budget);
  const match = payees.find((p) => !p.deleted && p.name === options.payeeName);
  return match ? { payee_id: match.id } : { payee_name: options.payeeName };
}

function addScheduleOptions(command: Command): Command {
  return command
    .option('--account <id>', 'Account ID')
    .option('--date <date>', 'Next date (YYYY-MM-DD)')
    .option('--amount <amount>', 'Amount in dollars (negative for outflow)', parseNumberOption)
    .option('--frequency <frequency>', `One of: ${FREQUENCIES.join(', ')}`, parseFrequency)
    .option('--payee-id <id>', 'Payee ID')
    .option('--payee-name <name>', 'Payee name (an existing payee with this exact name is used)')
    .option('--category-id <id>', 'Category ID')
    .option('--memo <memo>', 'Memo')
    .option('--flag-color <color>', 'Flag color (red, orange, yellow, green, blue, purple)')
    .option('-b, --budget <id>', 'Budget ID');
}

export function createScheduledCommand(): Command {
  const cmd = new Command('scheduled').description('Scheduled transaction operations');

  cmd
    .command('list')
    .description('List all scheduled transactions')
    .option('-b, --budget <id>', 'Budget ID')
    .option('--last-knowledge <number>', 'Last server knowledge for delta requests. When used, output includes server_knowledge.', parseIntegerOption)
    .action(
      withErrorHandling(
        async (options: { budget?: string; lastKnowledge?: number } & CommandOptions) => {
          const result = await client.getScheduledTransactions(
            options.budget,
            options.lastKnowledge
          );
          if (options.lastKnowledge !== undefined) {
            outputJson({
              scheduled_transactions: result?.scheduled_transactions,
              server_knowledge: result?.server_knowledge,
            });
          } else {
            outputJson(result?.scheduled_transactions);
          }
        }
      )
    );

  cmd
    .command('view')
    .description('View scheduled transaction')
    .argument('<id>', 'Scheduled transaction ID')
    .option('-b, --budget <id>', 'Budget ID')
    .action(
      withErrorHandling(async (id: string, options: CommandOptions) => {
        const scheduledTransaction = await client.getScheduledTransaction(id, options.budget);
        outputJson(scheduledTransaction);
      })
    );

  addScheduleOptions(
    cmd
      .command('create')
      .description(
        'Create a scheduled transaction. Requires --account, --date, --amount and --frequency.\n\n' +
          'Example:\n  ynab scheduled create --account <id> --date 2026-11-04 --amount -21.48 --frequency monthly --payee-name "Google" --category-id <id>'
      )
  ).action(
    withErrorHandling(async (options: ScheduleOptions & CommandOptions) => {
      if (!options.account || !options.date || options.amount === undefined || !options.frequency) {
        throw new YnabCliError('--account, --date, --amount and --frequency are required', 400);
      }
      const scheduled = await client.createScheduledTransaction(
        {
          scheduled_transaction: {
            account_id: options.account,
            date: parseDate(options.date),
            amount: amountToMilliunits(options.amount),
            frequency: options.frequency,
            category_id: options.categoryId,
            memo: options.memo,
            flag_color: options.flagColor as never,
            ...(await payeeFields(options)),
          },
        },
        options.budget
      );
      outputJson(scheduled);
    })
  );

  addScheduleOptions(
    cmd
      .command('update')
      .argument('<id>', 'Scheduled transaction ID')
      .description(
        'Update a scheduled transaction. Only the fields you pass change; the rest are kept.\n\n' +
          'Example:\n  ynab scheduled update <id> --amount -29.00 --date 2026-10-10 --account <venture-id>'
      )
  ).action(
    withErrorHandling(async (id: string, options: ScheduleOptions & CommandOptions) => {
      const existing = await client.getScheduledTransaction(id, options.budget);
      if (existing.deleted) {
        throw new YnabCliError(`Scheduled transaction ${id} is deleted`, 404);
      }
      const scheduled = await client.updateScheduledTransaction(
        id,
        {
          scheduled_transaction: {
            account_id: options.account ?? existing.account_id,
            date: options.date ? parseDate(options.date) : existing.date_next,
            amount: options.amount !== undefined ? amountToMilliunits(options.amount) : existing.amount,
            frequency: options.frequency ?? existing.frequency,
            category_id: options.categoryId ?? existing.category_id,
            memo: options.memo ?? existing.memo,
            flag_color: (options.flagColor ?? existing.flag_color) as never,
            ...((await payeeFields(options)) ?? { payee_id: existing.payee_id }),
          },
        },
        options.budget
      );
      outputJson(scheduled);
    })
  );

  cmd
    .command('delete')
    .description('Delete scheduled transaction')
    .argument('<id>', 'Scheduled transaction ID')
    .option('-b, --budget <id>', 'Budget ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(
        async (id: string, options: { budget?: string; yes?: boolean } & CommandOptions) => {
          requireConfirmation('scheduled transaction', options.yes);
          // YNAB silently keeps schedules whose first date is in the past (one that has
          // already produced occurrences). Resetting date_first to the next date first
          // makes the delete stick.
          const existing = await client.getScheduledTransaction(id, options.budget);
          if (!existing.deleted && existing.date_first !== existing.date_next) {
            await client.updateScheduledTransaction(
              id,
              {
                scheduled_transaction: {
                  account_id: existing.account_id,
                  date: existing.date_next,
                  amount: existing.amount,
                  frequency: existing.frequency,
                  payee_id: existing.payee_id,
                  category_id: existing.category_id,
                  memo: existing.memo,
                  flag_color: existing.flag_color as never,
                },
              },
              options.budget
            );
          }
          const scheduledTransaction = await client.deleteScheduledTransaction(id, options.budget);
          const after = await client.getScheduledTransaction(id, options.budget).catch(() => null);
          if (after && !after.deleted) {
            throw new YnabCliError(
              'YNAB accepted the delete but the schedule still exists. Delete it in the YNAB app instead.',
              409
            );
          }
          outputJson({
            message: 'Scheduled transaction deleted',
            scheduled_transaction: scheduledTransaction,
          });
        }
      )
    );

  return cmd;
}
