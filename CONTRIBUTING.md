# Contributing

Thanks for taking an interest in Family Care Coordination. The project is an early, non-clinical prototype; feedback on usability, accessibility, privacy, and family coordination workflows is welcome.

## Before opening an issue or pull request

- Use fictional names and data in examples, screenshots, and tests.
- Do not submit patient identifiers, family chat messages, contact details, hospital records, or clinical information.
- Do not include credentials, `.env` files, database exports, or production data.
- Keep changes within scheduling and coordination. The project does not make clinical decisions or replace hospital policies.

## Development checks

Use pnpm 10.18.0 and run the relevant checks before proposing a change:

```bash
pnpm check
pnpm test
pnpm build
```

For database changes, include an additive, reviewed migration and document any operational impact. Never test migrations against production or real family data.

## Commits and pull requests

Use concise English commit subjects, preferably Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, or `test:`. Pull requests should explain the user-facing behavior, note privacy implications, and include tests for changed business rules.

## Security and privacy reports

Do not publish secrets or personal data in a public issue. Contact the repository owner privately with a minimal description and no sensitive records.
