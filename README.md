# YNAB CLI

[![npm version](https://img.shields.io/npm/v/@stephendolan/ynab-cli.svg)](https://www.npmjs.com/package/@stephendolan/ynab-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A command-line interface for YNAB designed for LLMs and developers. JSON output by default with built-in filtering.

## Installation

Requires [Bun](https://bun.sh).

```bash
bun install -g @stephendolan/ynab-cli

# Or run without installing
bunx @stephendolan/ynab-cli budgets list
```

<details>
<summary>Linux: requires libsecret for keychain storage</summary>

```bash
sudo apt-get install libsecret-1-dev  # Ubuntu/Debian
sudo dnf install libsecret-devel      # Fedora/RHEL
sudo pacman -S libsecret              # Arch
```

Without libsecret, use `YNAB_API_KEY` environment variable instead.
</details>

## Authentication

```bash
ynab auth login    # Store token in OS keychain
ynab auth status   # Check authentication
ynab auth logout   # Remove credentials
```

Or set `YNAB_API_KEY` environment variable.

## Commands

### Budgets

```bash
ynab budgets list
ynab budgets view [id]
ynab budgets settings [id]
ynab budgets set-default <id>
```

### Accounts

```bash
ynab accounts list
ynab accounts view <id>
ynab accounts transactions <id>

# Reconcile against the bank's real balance: verifies the cleared balance, then marks cleared rows reconciled
ynab accounts reconcile <id> --balance 1144.79 --dry-run
ynab accounts reconcile <id> --balance -2965.38 [--adjust]
```

### Categories

```bash
ynab categories list
ynab categories view <id>
ynab categories create --name "Claude - 13th" --group "Subscriptions (Monthly)" [--note <note>]
ynab categories update <id> [--name <name>] [--note <note>] [--category-group-id <id>] [--goal-target <amount>]
ynab categories budget <id> --month <YYYY-MM> --amount <amount>
ynab categories transactions <id>
```

### Transactions

```bash
# List with filters
ynab transactions list --account <id> --since <YYYY-MM-DD>
ynab transactions list --approved=false --min-amount 100
ynab transactions list --fields id,date,amount,memo

# Search
ynab transactions search --memo "coffee"
ynab transactions search --payee-name "Amazon"

# CRUD
ynab transactions view <id>
ynab transactions create --account <id> --amount <amount> --date <YYYY-MM-DD>
ynab transactions update <id> --amount <amount>
ynab transactions delete <id>
ynab transactions split <id> --splits '[{"amount": -50.00, "category_id": "xxx"}]'

# Bulk
ynab transactions batch-create --transactions '[{"account_id": "xxx", "date": "2026-10-01", "amount": -27.00, "import_id": "venmo:123"}]'
ynab transactions batch-update --transactions '[{"id": "xxx", "approved": true}]'
ynab transactions approve --since 2026-09-01 --dry-run
ynab transactions approve --all
```

### Payees

```bash
ynab payees list
ynab payees view <id>
ynab payees update <id> --name <name>
ynab payees locations <id>
ynab payees transactions <id>
```

### Months

```bash
ynab months list
ynab months view <YYYY-MM>
```

### Scheduled Transactions

```bash
ynab scheduled list
ynab scheduled view <id>
ynab scheduled create --account <id> --date <YYYY-MM-DD> --amount -21.48 --frequency monthly --payee-name "Google"
ynab scheduled update <id> --amount -29.00 --date 2026-10-10
ynab scheduled delete <id> --yes
```

### Raw API Access

```bash
ynab api GET /plans
ynab api POST /plans/{plan_id}/transactions --data '{"transaction": {...}}'
```

### MCP Server

Run as an MCP server for AI agent integration:

```bash
ynab mcp
```

## Output

All commands return JSON. Use `--compact` for minified output.

**Amounts are in dollars** (not YNAB's internal milliunits). `--min-amount 100` means $100.

## API Limitations

The YNAB API does not support updating accounts. Use the web or mobile app for this.

The API cannot unlink a matched transaction pair, or set an account's last-reconciled date; use the app for those. YNAB's API silently keeps a scheduled transaction whose first date is in the past: the DELETE returns `deleted: true`, but the schedule is restored within seconds. `ynab scheduled delete` works around this by resetting the first date to the next date before deleting, then verifies the schedule is gone.

The API supports creating payees and category groups. Use raw API access for these:

```bash
ynab api POST /plans/{plan_id}/payees --data '{"payee": {"name": "Coffee Shop"}}'
```

Rate limit: 200 requests/hour per token. If exceeded, wait 5-10 minutes.

## References

- [YNAB API Documentation](https://api.ynab.com/)
- [Specification](./SPEC.md)

## License

MIT
