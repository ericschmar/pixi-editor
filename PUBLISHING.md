# Releasing pixi-watchface-engine

Use **Bun** for installation, checks, packing, and publishing. The package is
hosted on the npm registry; registry hosting does not require using the npm CLI.

Publication is a **manual maintainer step**. The maintainer completes the registry's
browser/passkey authentication. Agents prepare and verify the release, but must
not publish it, request credentials, or bypass authentication.

## Prepare a release

Work from the reviewed release branch, with a clean working tree. Choose an unused
version using `bun info pixi-watchface-engine versions`, update `package.json` and
its lockfile metadata if necessary, and document the new public contracts in
`API.md`. Additive capabilities normally warrant a minor release; retain existing
serialized defaults and cover compatibility with tests.

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
bun pm pack --dry-run
```

`prepublishOnly` currently runs typecheck and build, **not tests**. Run tests
explicitly. Inspect the package listing: it should contain the intended `dist/`
JavaScript/declarations, package metadata, `README.md`, `API.md`, and license, not
local fixtures, credentials, or generated test output.

Pack the actual release artifact outside the checkout:

```sh
mkdir -p /tmp/pixi-engine-release
bun pm pack --destination /tmp/pixi-engine-release
```

Record the resulting tarball name and hash. In an isolated consumer with the
browser acceptance harness, install that tarball using `bun add /absolute/path/to/package.tgz`.
Run declaration checks and the real Chromium acceptance suite against the
installed package root, not source aliases or a linked checkout. Toki's
`scripts/engine-acceptance/README.md` documents the commands and required explicit
expected version. Unit tests alone do not prove pointer interaction or image
loading behavior.

Commit and push the reviewed source/version changes before handing the verified
tarball and its exact version/hash to the maintainer. A passing packed-artifact
test is a release prerequisite, **not evidence of registry publication**.

## Maintainer-only publication

After all acceptance checks pass, the maintainer runs this locally, substituting
the exact verified tarball path:

```sh
bun publish /absolute/path/to/pixi-watchface-engine-VERSION.tgz --tag latest
```

Complete Bun's registry web/passkey prompt personally. Do not put credentials or
one-time codes in chat, committed files, or release notes. If authentication fails,
resolve it through the registry's supported login flow; do not weaken account
security or use an automation bypass.

## Verify the registry artifact

After the maintainer confirms publication:

```sh
bun info pixi-watchface-engine@VERSION --json
# In a separate clean consumer:
bun add --exact pixi-watchface-engine@VERSION
```

Rerun declaration and Chromium acceptance against that freshly installed registry
artifact and record its version/integrity/hash. Only then update Toki's exact
dependency and lockfile and rerun its integration checks. Do not substitute a
successful tarball test for this consumed-artifact gate. Tag the verified source
commit for the released version without rewriting an existing tag.

The generic engine gate does not certify Toki persistence, Garmin rendering,
actual device sleep/wake behavior, or hardware power and memory limits.
