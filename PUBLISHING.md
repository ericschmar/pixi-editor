# Publishing Pixi Watchface Engine to npm

This guide walks you through publishing the library to npm.

## Prerequisites

- npm account (create at https://www.npmjs.com)
- Bun installed
- Git repository set up
- Build verified locally

## Step 1: Update Package Metadata

Edit `package.json` and replace placeholder values:

```json
{
  "name": "pixi-watchface-engine",
  "version": "0.1.0",
  "description": "A PixiJS v8 watchface editor engine with visual editor, plugin system, and intuitive API",
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/pixi-watchface-engine"
  },
  "homepage": "https://github.com/your-username/pixi-watchface-engine#readme",
  "bugs": {
    "url": "https://github.com/your-username/pixi-watchface-engine/issues"
  }
}
```

## Step 2: Verify Build Output

Run the build to ensure all files are generated:

```bash
bun run build
```

This creates:
- `dist/index.js` — bundled library
- `dist/**/*.d.ts` — TypeScript definitions
- `dist/**/*.d.ts.map` — source maps

## Step 3: Initialize Git Repository

```bash
cd /Users/mmacbook/develop/pixi-editor
git init
git add .
git commit -m "Initial commit: PixiJS watchface editor engine v0.1.0"
git branch -M main
```

## Step 4: Create GitHub Repository

1. Go to https://github.com/new
2. Create repository: `pixi-watchface-engine`
3. Don't initialize with README (we already have one)
4. Add remote and push:

```bash
git remote add origin https://github.com/your-username/pixi-watchface-engine.git
git push -u origin main
```

## Step 5: Authenticate with npm

```bash
# Login to npm (will prompt for username/password/2FA)
bun login
```

Or use npm CLI:

```bash
npm login
```

To verify authentication:

```bash
npm whoami
```

## Step 6: Publish to npm

### First-time Publication

```bash
bun publish
```

Or with npm:

```bash
npm publish
```

This will:
1. Run `prepublishOnly` script (typecheck + build)
2. Package the contents from `files` array in package.json
3. Upload to npm registry
4. Make it available at `npm install pixi-watchface-engine`

### Verify Publication

After 1-2 minutes, verify it's live:

```bash
npm view pixi-watchface-engine
# or
npm search pixi-watchface-engine
```

Visit: https://www.npmjs.com/package/pixi-watchface-engine

## Step 7: Test Installation

Test in a fresh project:

```bash
# Create test directory
mkdir test-pixi-watchface
cd test-pixi-watchface

# Initialize and install
bun init -y
bun add pixi-watchface-engine pixi.js

# Create test file
cat > index.ts << 'EOF'
import { WatchfaceEngine, TextElement } from 'pixi-watchface-engine';

const engine = new WatchfaceEngine();
console.log('✓ Import successful');
EOF

# Run
bun index.ts
```

## Publishing Updates

When you make changes and want to release a new version:

### 1. Update Version

Edit `package.json`:

```json
{
  "version": "0.2.0"
}
```

Follow **semantic versioning**:
- `MAJOR.MINOR.PATCH` (1.2.3)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### 2. Commit and Push

```bash
git add package.json
git commit -m "chore: bump version to 0.2.0"
git tag v0.2.0
git push origin main --tags
```

### 3. Publish

```bash
bun publish
```

## Version History Example

```
0.1.0 - Initial release (Feb 2026)
  - Core engine with elements and selection
  - Plugin system
  - Grid, autosave, undo/redo, keyboard shortcuts

0.1.1 - Bug fixes (Feb 2026)
  - Fix fill percentage for arcs

0.2.0 - New features (Mar 2026)
  - Add image filtering support
  - Add custom blend modes
  - Improve serialization performance

1.0.0 - Stable release (Apr 2026)
  - API locked for backward compatibility
  - Complete documentation
```

## Versioning Best Practices

**PATCH (0.1.1):**
- Bug fixes
- Documentation updates
- Internal refactoring (no API changes)
- Performance improvements

**MINOR (0.2.0):**
- New features (backward compatible)
- New element types
- New plugins
- Non-breaking API additions

**MAJOR (1.0.0):**
- Breaking API changes
- Major restructuring
- Removal of deprecated features

## Pre-publication Checklist

Before publishing:

- [ ] Run `bun run typecheck` — no errors
- [ ] Run `bun run build` — builds successfully
- [ ] `dist/` contains `index.js` and `*.d.ts` files
- [ ] `package.json` has correct metadata
- [ ] `README.md` is complete and accurate
- [ ] `LICENSE` file exists
- [ ] `.npmignore` excludes unnecessary files
- [ ] `.gitignore` is configured
- [ ] Git repository initialized with commits
- [ ] GitHub repository exists (recommended)
- [ ] Authenticated with npm (`bun login`)

## Troubleshooting

### "Cannot find package.json"

Ensure you're in the correct directory:

```bash
cd /Users/mmacbook/develop/pixi-editor
ls package.json
```

### "401 Unauthorized"

You're not authenticated. Run:

```bash
bun login
npm whoami  # Verify
```

### "409 Conflict - package name already registered"

The package name exists. Choose a different name or use a scope:

```json
{
  "name": "@your-scope/pixi-watchface-engine"
}
```

### "dist/index.js not found"

Run the build first:

```bash
bun run build
ls dist/index.js
```

### Large bundle size (>1MB)

The bundle includes PixiJS. This is expected. Consider:
- Making PixiJS a peer dependency only
- Adding a note in README about bundle size
- Documenting tree-shaking potential

## Publishing Channels

### Latest (default)

```bash
bun publish  # publishes to @latest
```

Users install with:
```bash
npm install pixi-watchface-engine
```

### Beta Channel

For pre-release versions:

```bash
# Update version
# package.json: "version": "0.2.0-beta.1"

bun publish --tag beta
```

Users install with:
```bash
npm install pixi-watchface-engine@beta
```

### Release Candidates

```bash
# package.json: "version": "1.0.0-rc.1"
bun publish --tag rc
```

## NPM Package Page Features

After publishing, your package page will include:

- README.md preview
- Installation instructions
- Package statistics (downloads, versions)
- Repository link
- Contributor list
- Dependency information

To improve visibility:

1. **Add GitHub topics** — add `pixi`, `pixijs`, `watchface`, `editor`
2. **Create releases** — GitHub automatically syncs npm
3. **Write CHANGELOG.md** — document version changes
4. **Add badges** — npm version badge in README

Example README badges:

```markdown
[![npm version](https://img.shields.io/npm/v/pixi-watchface-engine.svg)](https://www.npmjs.com/package/pixi-watchface-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
```

## Maintenance

### Regular Tasks

- Keep dependencies updated: `bun update`
- Monitor GitHub issues and discussions
- Review pull requests
- Tag releases in Git
- Update CHANGELOG.md with release notes

### Deprecation

To deprecate a version:

```bash
npm deprecate pixi-watchface-engine@0.1.0 "Use 1.0.0+ instead"
```

## Support & Links

- **npm**: https://www.npmjs.com/package/pixi-watchface-engine
- **GitHub**: https://github.com/your-username/pixi-watchface-engine
- **Issues**: https://github.com/your-username/pixi-watchface-engine/issues
- **Discussions**: https://github.com/your-username/pixi-watchface-engine/discussions

## Next Steps

1. Update `package.json` author and repository info
2. Create GitHub repository
3. Run `bun run build` to verify
4. Run `bun login` to authenticate
5. Run `bun publish` to publish

Happy publishing! 🚀
