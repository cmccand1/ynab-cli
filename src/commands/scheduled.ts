import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, requireConfirmation, parseIntegerOption } from '../lib/command-utils.js';
import type { CommandOptions } from '../types/index.js';

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
          const scheduledTransaction = await client.deleteScheduledTransaction(id, options.budget);
          outputJson({
            message: 'Scheduled transaction deleted',
            scheduled_transaction: scheduledTransaction,
          });
        }
      )
    );

  return cmd;
}
