#!/usr/bin/env bun

import { Command } from 'commander';
import { outputError, setOutputOptions } from './lib/output.js';
import { createAuthCommand } from './commands/auth.js';
import { createUserCommand } from './commands/user.js';
import { createBudgetsCommand } from './commands/budgets.js';
import { createAccountsCommand } from './commands/accounts.js';
import { createCategoriesCommand } from './commands/categories.js';
import { createTransactionsCommand } from './commands/transactions.js';
import { createScheduledCommand } from './commands/scheduled.js';
import { createPayeesCommand } from './commands/payees.js';
import { createMonthsCommand } from './commands/months.js';
import { createApiCommand } from './commands/api.js';
import { createMcpCommand } from './commands/mcp.js';

declare const __VERSION__: string;

const program = new Command();

program
  .name('ynab')
  .description('A command-line interface for You Need a Budget (YNAB)')
  .version(__VERSION__)
  .option('-c, --compact', 'Minified JSON output (single line)')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    setOutputOptions({
      compact: options.compact,
    });
  });

program.addCommand(createAuthCommand());
program.addCommand(createUserCommand());
program.addCommand(createBudgetsCommand());
program.addCommand(createAccountsCommand());
program.addCommand(createCategoriesCommand());
program.addCommand(createTransactionsCommand());
program.addCommand(createScheduledCommand());
program.addCommand(createPayeesCommand());
program.addCommand(createMonthsCommand());
program.addCommand(createApiCommand());
program.addCommand(createMcpCommand());

// Report Commander's own usage errors (missing argument, unknown option,
// invalid value) in the same JSON shape as every other error
function useJsonErrors(command: Command): void {
  command.configureOutput({
    outputError: (message) =>
      outputError({
        name: 'cli_error',
        detail: message.replace(/^error: /, '').trim(),
        statusCode: 400,
      }),
  });
  command.commands.forEach(useJsonErrors);
}

useJsonErrors(program);

program.parse();
