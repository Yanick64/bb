# BB

A task-first software factory with a board per project and Amp threads running in remote orbs.

## Development

Requires Bun 1.3+ and the Amp CLI for remote execution.

```sh
bun install
cp .env.example .env
bun dev
```

Open http://localhost:5173. SQLite data and screenshots live in `data/`, outside Git. The app starts empty; use **Voorbeeldproject laden** to explore with synthetic data.

```sh
bun run check
bun run build
bun start
```

The production server serves the built app on http://127.0.0.1:4310.

Implementation and integration notes will be added as the vertical slice is completed.
