# Family Care Coordination

A mobile-first, non-clinical prototype for organizing family caregiving logistics around a hospitalized relative. It focuses on schedules, availability, caregiver bookings, cost tracking, and contingency coordination—not medical care.

> This public snapshot is anonymized. It does not include the original family requirements, patient identity, family messages, project credentials, or production data. The application UI remains in Brazilian Portuguese; repository documentation is in English.

## What it covers

- Participant profiles for family members, caregivers, and other helpers.
- Availability windows, commitments, and manually managed shifts.
- Daytime and overnight coverage-gap analysis, with explicit confirmation states.
- Coordinator-recorded acceptances, refusals, and cancellations received through external channels, with actor and channel written to the audit trail.
- Caregiver reference rates, bookings, separate payment records, and financial summaries.
- A manual emergency activation flow following an unsuccessful caregiver attempt.

## Boundaries and safety

The system is not a clinical or medical-record application. Do not enter diagnoses, symptoms, medication details, treatment plans, or other health records. Hospital-specific companion permissions are managed by the family outside this application and are not collected or verified by the software. Use fictional data for demos and development.

This is a prototype, not a production-ready service. Before real use, an operator must review access controls, backups, notifications, operational procedures, and applicable privacy requirements. The software does not replace hospital policies or emergency services.

## Technology

- React 19, TypeScript, Vite, Tailwind CSS, and Wouter.
- Express and tRPC v11.
- Drizzle ORM with MySQL.
- `America/Fortaleza` as the operational time zone and BRL amounts stored as integer cents.

## Local development

The project uses pnpm 10.18.0. Install dependencies with `pnpm install --frozen-lockfile`, then run `pnpm dev`. The server-side authentication and database integrations expect a properly configured Manus WebDev environment or equivalent development services. No credentials or production dataset are included in this repository.

Useful commands:

```bash
pnpm check
pnpm test
pnpm build
```

Database migrations affect the database configured for the environment. Never run them against production or a real family's data as part of a demo.

## Repository policy

Do not commit `.env` files, credentials, personal contact information, family chat exports, patient identifiers, or real health information. Keep test fixtures synthetic. Please report suspected privacy or security issues privately rather than posting sensitive details in a public issue.

## License

No license has been assigned. Public visibility does not grant permission to reuse, modify, or redistribute this code.
