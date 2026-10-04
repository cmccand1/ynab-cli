# Potential improvements

Open items from a 2026-10-03 review of this CLI against the `cli-for-agents` checklist (how well a CLI works for coding agents and scripts). Ordered by expected impact. Nothing here is committed work.

Since done: `accounts reconcile`, `transactions approve`, `categories create`, `scheduled create`/`update`, and a `scheduled delete` that verifies the delete stuck (2026-10-04).

Already done from the same review: an import ID on `transactions create` and the MCP `create_transaction` tool (a repeat returns a 409 `conflict`, confirmed live), strict numeric option parsing, all errors as JSON on stderr (including Commander's usage errors), and `server_knowledge` in the output of every list command that takes `--last-knowledge`.

## High impact

### Add `--dry-run` to write commands

`transactions create`, `update`, `delete`, `split`, `batch-update`, `categories update`, `categories budget`, `payees update` and `scheduled delete` all act immediately. A dry run that prints the exact request (method, path, body) without sending it would let callers preview a change.

Most valuable for `transactions split --force`, which deletes the transaction and then recreates it (`src/commands/transactions.ts`). If the create fails after the delete, the transaction is lost; consider creating first, or at least printing the deleted transaction's full data on failure.

## Medium impact

### Add examples to every `--help`

No help screen contains an example. `transactions create --help`, for instance, lists `--amount` without showing that outflows are negative. Commander's `addHelpText('after', ...)` supports this. Two or three real invocations per command.

### Put example invocations in error messages

Errors say what is wrong but not how to fix it. "--account is required in non-interactive mode" should show a working command and how to find the value (`ynab accounts list`). That wording is also stale: `transactions create` has no interactive mode.

### Bound the output of large reads

- `budgets view` returns the whole budget (about 2.9 MB on a real budget).
- `transactions list` with no `--since` returns every transaction.
- `payees list` returned 1,121 rows (130 KB).

Add `--limit` and `--fields` to all list commands (only transaction lists have them), and consider a default limit or a required `--since` on `transactions list`.

### Accept JSON from stdin

`--splits`, `--transactions` and `--data` only take inline strings, which forces fragile shell quoting for large batches. Accept `-` or a `--stdin` flag.

## Lower impact

### No command to create category groups

`categories create` needs an existing group. New groups need `ynab api POST "/plans/{plan_id}/category_groups" --data '{"category_group":{"name":"Pets"}}'`. A `categories create-group --name` (or `--group` creating a missing group with a flag) would close the gap.

### Filter out hidden and deleted categories

`categories list` returns hidden (retired) and deleted categories alongside live ones, so callers must filter with `jq` to avoid proposing a retired category. A flag such as `--active` would make the safe default one word.

### MCP has no bulk create

The CLI has `transactions batch-create`; the MCP server has no matching tool, so MCP callers still create one transaction per request.

### Inconsistent flag names

The same concept is `--account` / `--category` / `--payee` on `transactions list` but `--category-id` / `--payee-id` (and `--account`) on `transactions create` and `update`.

### `transactions update` cannot unset values

`--approved` can only set approved to true; there is no way to unapprove a transaction or clear a memo.

### Distinct exit codes

Every failure exits with code 1. Separate codes for usage errors, auth failures, not-found and rate limits would let callers branch without parsing the JSON.

### `ynab api` is not raw

Its output goes through the same milliunit-to-dollar conversion as every other command, despite the "Raw API access" description. Document it or add a `--raw` flag.

### `categories budget --month` rejects `current`

`months view current` works, but `categories budget --month current` still fails because the month goes through the date parser (`src/commands/categories.ts`). The YNAB API accepts `current` there too.

### Stale `CLAUDE.md`

It documents a global `--output` flag, a global `--budget` flag, `outputSuccess()`, `YnabClient.withErrorHandling()` and `src/lib/prompts.ts`. None of these exist.

## Unverified

### Interest rates may be converted as money

`convertMilliunitsToAmounts` divides the values in `debt_interest_rates` by 1000 along with the money fields (`isDebtAmountMapField` in `src/lib/utils.ts`). Not confirmed against unconverted API output; check with a debt account before changing.

### Delta requests return a different set of rows

With `--last-knowledge`, YNAB returns rows the plain lists omit. Observed: `transactions list` returned 8 extra rows, all with `matched_transaction_id` set; `payees list` returned 1,363 rows against 1,121; `scheduled list` returned 59 against 44 (likely deleted items, not checked). Callers that sum or count a delta result need to filter. Worth documenting in the `--last-knowledge` help once the cause is confirmed.
