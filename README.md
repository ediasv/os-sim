# os-sim

An operating-system simulator desktop app built with Electron, Vue 3 and TypeScript.

## Development

```sh
npm install
npm start          # run the app with hot reload
npm run lint       # oxlint + oxfmt check (npm run lint:fix to auto-fix)
npm run typecheck  # vue-tsc over .ts and .vue files
npm run package    # build an unpacked app into out/
```

## Contributing

`main` holds a linear history in which every commit is one squash-merged pull request or one release commit.

### 1. Branch off `main`

```sh
git switch main && git pull
git switch -c feat/short-description
```

Name the branch with a prefix: `feat/`, `fix/`, `chore/`, `docs/` or `refactor/`.

### 2. Work and commit freely

Commit messages on the branch can be as messy as you like, because they disappear in the squash. Before you open the PR, run:

```sh
npm run lint && npm run typecheck
```

### 3. Open a PR and squash-merge it

- Give the PR a [Conventional Commits](https://www.conventionalcommits.org) title, such as `feat: add round-robin scheduler` or `fix: correct page fault count`.
  The squash merge makes the PR title the single commit message on `main`, so the title is what ends up in the history and in the release notes.
- Merge with **Squash and merge** only, then delete the branch.

### Things to avoid

- Don't bump the version or create tags in feature PRs. Releasing is a separate step (see below).
- Don't push commits straight to `main`. The release commit is the only exception.

## Releasing

A pushed tag matching `v*` triggers `.github/workflows/release.yml`. It builds the installers on Linux, Windows and macOS and uploads them to a **draft** GitHub release. The tag must match the `version` in `package.json`, because Electron Forge names the release after that version. `npm version` keeps the two in sync.

### 1. Bump the version from an up-to-date `main`

```sh
git switch main && git pull
npm version patch -m "chore(release): v%s"   # or minor / major
```

`npm version` does three things in one step:

- updates `package.json` and `package-lock.json`
- creates the commit `chore(release): vX.Y.Z`
- creates the tag `vX.Y.Z`

It refuses to run if the working tree is dirty.

Which bump to choose:

| Change since the last release      | Command             |
| ---------------------------------- | ------------------- |
| Only fixes and chores              | `npm version patch` |
| New features, backwards compatible | `npm version minor` |
| Breaking changes                   | `npm version major` |

### 2. Push the commit and the tag together

```sh
git push --follow-tags
```

This pushes the release commit to `main` and the tag, and the tag starts the Release workflow.

### 3. Publish the draft

When all three jobs in the **Actions** tab are green, go to **Releases**, check the attached assets and the auto-generated notes, and click **Publish release**.

### If a release fails

If CI fails before you publish, fix the problem in a normal PR and then release a new patch version.
Don't move or re-push an existing tag. Delete the failed draft release on GitHub, and if you want, delete the tag too: `git push --delete origin vX.Y.Z && git tag -d vX.Y.Z`.
