# API-split Phase 2: clean release checkout

Phase 2 creates a clean, isolated checkout for an already-reviewed candidate commit. It does not commit current work, discard files, or deploy anything.

First inspect the intended candidate:

```sh
node scripts/prepare-api-split-release-worktree.mjs --commit <candidate-sha>
```

Then create the checkout only after review:

```sh
node scripts/prepare-api-split-release-worktree.mjs --commit <candidate-sha> --execute
```

Use the reported checkout directory for Phase 3 staging rehearsal. The active development worktree remains unchanged.

Never point `--destination` at the active repository, its parent directory, or an existing directory.
