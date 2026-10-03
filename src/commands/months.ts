import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling, parseIntegerOption } from '../lib/command-utils.js';
import { parseDate } from '../lib/dates.js';
import type { CommandOptions } from '../types/index.js';

export function createMonthsCommand(): Command {
  const cmd = new Command('months').description('Monthly budget operations');

  cmd
    .command('list')
    .description('List all budget months')
    .option('-b, --budget <id>', 'Budget ID')
    .option('--last-knowledge <number>', 'Last server knowledge for delta requests. When used, output includes server_knowledge.', parseIntegerOption)
    .action(
      withErrorHandling(
        async (options: { budget?: string; lastKnowledge?: number } & CommandOptions) => {
          const result = await client.getBudgetMonths(options.budget, options.lastKnowledge);
          if (options.lastKnowledge !== undefined) {
            outputJson({ months: result?.months, server_knowledge: result?.server_knowledge });
          } else {
            outputJson(result?.months);
          }
        }
      )
    );

  cmd
    .command('view')
    .description('View specific month details')
    .argument('<month>', 'Budget month (e.g., 2025-07-01, or "current")')
    .option('-b, --budget <id>', 'Budget ID')
    .action(
      withErrorHandling(async (month: string, options: CommandOptions) => {
        const monthData = await client.getBudgetMonth(
          month === 'current' ? month : parseDate(month),
          options.budget
        );
        outputJson(monthData);
      })
    );

  return cmd;
}
