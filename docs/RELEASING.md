# Releasing

Versions come from the commit history. Nobody writes a version number or release notes by hand, and the repository has no changelog file: the notes of each release are in its GitHub release.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`.

| Type | Effect on the version (before 1.0.0) | In the release notes |
|---|---|---|
| `feat:` | minor (0.1.0 → 0.2.0) | Features |
| `fix:`, `perf:`, `revert:` | patch (0.1.0 → 0.1.1) | Fixes, Performance, Reverts |
| `feat!:` or a `BREAKING CHANGE:` footer | minor before 1.0.0, major after | Features, with a note |
| `docs:`, `test:`, `ci:`, `chore:`, `refactor:`, `style:` | none by themselves | hidden |

The repository is squash-merged, so what counts is the **pull request title**: it becomes the commit message on `main`. The `Conventional PR title` check in CI rejects a title that is not in this form. Commits inside a pull request can be written freely.

## How a release happens

1. Pull requests are squash-merged into `main`.
2. On every push to `main`, the `release-please` job (`.github/workflows/release.yml`) opens or updates one pull request titled `chore(main): release X.Y.Z`. It changes one file, `.release-please-manifest.json` (the last released version), and its description lists the changes since the last release.
3. Merging that pull request creates the tag `vX.Y.Z` and a GitHub release with the notes.
4. The `publish` job then builds the PWA from the tag, attaches `riglam-practice-pwa-vX.Y.Z.zip` to the release, and deploys the PWA to production (see [DEPLOY.md](DEPLOY.md)). The artifact page is not attached: it holds the definitions in the clear.

The first release is `0.1.0` (`initial-version` in `release-please-config.json`; the manifest value `0.0.0` means that nothing is released yet). Versions stay below 1.0.0: a breaking change bumps the minor version, a `feat:` too, a `fix:` the patch. To release 1.0.0 deliberately, put `Release-As: 1.0.0` in a commit footer.

The version lives in the manifest only. `package.json` keeps the placeholder `0.0.0`, there is no `CHANGELOG.md` or `version.txt` (release-please writes those if they exist, so do not add them), and the app reads its version from the manifest (`scripts/lib/app-version.mjs`). Tags are plain `vX.Y.Z`.

Because the release pull request is created by a workflow, GitHub does not start CI on it when the default token is used. Either merge it without checks (it only changes the version in the manifest) or add the optional `RELEASE_PLEASE_TOKEN` secret (below).

## One-time repository settings (only the owner can set these)

- *Settings → Actions → General → Workflow permissions*: tick **Allow GitHub Actions to create and approve pull requests**. Without it the release pull request cannot be created.
- *Settings → General → Pull Requests*: allow **squash merging** only, with **default to pull request title** for the commit message.
- *Settings → Branches* (or Rulesets): protect `main` and require the checks `Lint, build, test` and `Conventional PR title`.
- Optional: a fine-grained personal access token (contents and pull requests: write) saved as the secret `RELEASE_PLEASE_TOKEN`, so CI runs on release pull requests.
- Secrets for deploys: see [DEPLOY.md](DEPLOY.md).

## Dependencies

Dependabot opens weekly pull requests for npm (dev dependencies grouped, title prefix `chore(deps)`) and for GitHub Actions (`ci(deps)`). Neither triggers a release by itself. `@playwright/test` is excluded because it is pinned to the browser version preinstalled in Claude's cloud container.

## Artifact versions are separate

Publishing the artifact build to the live artifact is not a release of this repository; the artifact keeps its own version ids (see [ARTIFACT-LOOP.md](ARTIFACT-LOOP.md)). To republish an older app version to the artifact, check out its tag and build it with the data key (`npm run build:artifact`).
