# Web

React application built with TypeScript, Vite and TanStack Query.

## Development

Use Node.js 24, matching CI. From the repository root, install dependencies with
`npm ci`, then start the app with `npm run dev -w apps/web`. Set `VITE_API_URL`
in `apps/web/.env` as described
in `.env.example` to connect to the backend.

## Tests

Run these commands from the repository root:

```sh
npm run test -w apps/web
npm run test:watch -w apps/web
npm run test:coverage -w apps/web
npm run test:typecheck -w apps/web
npm run test:lint -w apps/web
```

In Windows PowerShell with script execution disabled, use `npm.cmd`.

The main Vitest configuration discovers every `src/**/*.test.{ts,tsx}` and
`src/**/*.spec.{ts,tsx}` file. Component tests use jsdom, React Testing Library,
user-event and jest-dom. They run independently of Storybook and do not require
a browser installation, a running API or a database.

Test configuration sets a fixed API origin (`https://api.test.invalid`) and the
`Europe/Brussels` timezone. The shared setup cleans rendered components and
storage and restores mocks, environment variables and timers after each test.
Unmocked fetch calls reject immediately; tests must provide their own responses.
Query tests use a separate QueryClient with retries disabled and clear it after
use. Date boundary and timer tests control the clock explicitly.

The suite covers authentication and route access, API request/response contracts,
query and mutation behavior, clustering calculations, public pages, interactive
UI components and admin workflows, including batch cancellation, retries and
content review.

To run one area or one file:

```sh
npm run test -w apps/web -- src/features/auth
npm run test -w apps/web -- src/components/pages/AdminPage
npm run test -w apps/web -- src/shared/api/client.test.ts
```

Existing area-specific `vitest.*.config.ts` files inherit the main setup and
remain available for focused runs. Storybook retains its separate browser test
project in `vite.config.ts`; normal web tests do not run stories.

Coverage reports are written to `apps/web/coverage`: open `index.html` for the
per-file HTML report; `lcov.info` is available for coverage tools. All executable
application source is included, including files without tests. Declaration files,
barrel exports, stories, test helpers and the browser bootstrap are excluded;
TypeScript interfaces are erased and do not count as executable code.

Coverage must stay at or above 85% for statements, lines and functions and 80%
for branches. The API client, authentication utilities and clustering calculations
have stricter thresholds in `vitest.config.ts`. A drop below a threshold fails CI.

CI runs the suite with coverage and checks test types and lint as well as the
application build. When adding tests, assert observable behavior and failure
paths, use semantic element queries, mock the network boundary, and use deferred
promises or fake timers to control asynchronous work without arbitrary sleeps.
