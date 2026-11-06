# Dayframe backend — M2.1 only

Project: soft-night-61558675
Region: aws-eu-central-1
Branch: main
Database: dayframe
Function slug: dayframeapi

This foundation deliberately permits only public GET /health. All /v1/ routes return HTTP 401 even with a forged Bearer token until M2.2 implements verifiable Neon Auth. No real tasks, workspaces or time sessions exist.

## Local checks

    node --check backend/src/index.mjs
    node --test backend/tests/*.test.mjs

## Database

Apply backend/db/migrations/0001_foundation.sql only to the dedicated Dayframe project. Migration is idempotent. Database credentials must never enter GitHub, log output, or client bundles.

## Function

The Neon Node.js 24 function source is backend/src/index.mjs. Its deployment ZIP has a root index.mjs entry. Functions inject database credentials server-side; this foundation does not query the database or depend on secrets.

Deployment URL:
https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech/

Future authenticated routes must verify identity server-side and enforce ownership of every read/write. CORS is not authentication. The browser preview remains unchanged during M2.1.
