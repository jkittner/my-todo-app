# Todo board

> [!CAUTION]
>
> ## Disclaimer: built by Claude, pure AI slop
>
> This app was built by Claude and is pure AI slop. It is just a personal project. No one else should really use this.

A kanban todo board (To do, In progress, Done) that runs entirely in the browser and keeps your tasks only on your device.

## Use it

- **Hosted:** push to `main` and the GitHub Actions workflow tests the app and publishes `dist/` to GitHub Pages. In the repository settings, set Pages to deploy from GitHub Actions.
- **Offline:** run `npm run build` and open `dist/index.html` directly. It is a single self-contained file, so no server is needed. Don't open the `index.html` at the project root: it is the dev-server entry and only runs under `npm run dev`.

Each browser keeps its own tasks. To move them to another browser or device, use **Data → Back up tasks**, then **Restore from backup** on the other device.

To try a large board, restore `examples/sample-1500-tasks.json` (1,500 tasks, about a third in each column). `npm run sample -- <count>` generates other sizes.

### Automatic backup to a synced folder

**Data → Back up to a folder automatically** writes `todo-board-backup.json` into a folder you choose, about a second after every change. If you pick a folder that the sciebo or Nextcloud desktop app syncs, the backup reaches the cloud, and the cloud keeps earlier versions of the file. To recover, use **Restore from backup** with that file. The header shows when the last backup was written.

- This needs Chrome or Edge. Firefox can't write to folders on disk.
- After a browser restart, Chrome may ask once for access again. The header then shows **Resume backup**.
- It's one-way: the app only ever writes this file and never reads from the folder.

### Thunderbird

Choose **Data → Export tasks for Thunderbird (.ics)** to export your tasks as to-dos. Choose **Export calendar (.ics)** to export them as all-day events on their due dates. In Thunderbird, go to **File → Import…**, pick **Import from a file**, and select the `.ics` file.

## Develop

```sh
npm install
npm run dev            # local dev server
npm run build          # type-check and build dist/index.html
npm test               # unit and component tests (Vitest + jsdom)
npm run test:coverage  # same, enforcing 100% coverage
npx playwright install chromium
npm run test:e2e       # end-to-end tests over HTTP and file://, incl. performance with 300–5,000 tasks
npm run screenshots    # light/dark, desktop/phone screenshots for review
npm run sample         # regenerate examples/sample-1500-tasks.json
npm run format         # format everything with Prettier
```

### Pre-commit hooks

`.pre-commit-config.yaml` runs these hooks:

- **Every commit:** file hygiene (trailing whitespace, final newlines, LF line endings, YAML/JSON syntax, merge markers, large files, private keys), a schema check of the GitHub workflows, Prettier, and the type check.
- **Every push:** the unit tests.

```sh
pip install pre-commit   # or: pipx install pre-commit
pre-commit install       # sets up both the commit and push hooks
pre-commit run --all-files
```

The Prettier, type-check and test hooks use the project's own `node_modules`, so run `npm install` first.

CI (`.github/workflows/ci.yml`) runs the format check, the type check, the unit tests with coverage, and the end-to-end tests on every push and pull request. When CI passes on `main`, `.github/workflows/pages.yml` deploys to GitHub Pages.

Large boards stay responsive: columns render 100 cards at a time ("Show 100 more"), and search and filters always cover every task. `tests/performance.test.tsx` and `e2e/performance.spec.ts` check time budgets with 300, 1,000 and 5,000 generated tasks. A board of 5,000 tasks takes about 3 MB of the browser's roughly 5 MB local storage.

Stack: Preact, TypeScript and Vite (bundled into one file by `vite-plugin-singlefile`), `marked` and DOMPurify for GitHub-flavoured markdown, and Public Sans (self-hosted).
