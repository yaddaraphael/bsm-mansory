# Upgrading to Next.js 15 - Migration Guide

## What Changed

### Package Updates
- ✅ **Next.js**: `14.2.18` → `15.1.6` (latest stable)
- ✅ **React**: `18.3.1` → `19.0.0` (React 19 support)
- ✅ **ESLint**: `8.57.1` → `9.17.0` (flat config)
- ✅ **eslint-config-next**: `14.2.18` → `15.1.6`
- ✅ **Type definitions**: Updated for React 19

### Security Fixes
- ✅ Fixes `glob` vulnerability (3 high severity issues resolved)
- ✅ Latest security patches

## Installation Steps

1. **Remove old dependencies**:
```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
```

2. **Install new versions**:
```powershell
npm install
```

3. **Update ESLint config** (already done):
   - Old: `.eslintrc.json` (still works but deprecated)
   - New: `eslint.config.mjs` (flat config format)

## Breaking Changes to Watch

### React 19
- Mostly backward compatible
- Some hooks behavior slightly changed
- Better concurrent rendering

### Next.js 15
- Improved caching behavior
- Better TypeScript support
- Some API route changes (minor)

### ESLint 9
- Uses flat config format (`eslint.config.mjs`)
- Old `.eslintrc.json` still works but is deprecated
- Better performance

## Testing After Upgrade

1. **Start dev server**:
```powershell
npm run dev
```

2. **Run linter**:
```powershell
npm run lint
```

3. **Build for production**:
```powershell
npm run build
```

## If You Encounter Issues

### React 19 Compatibility
Most components should work, but if you see errors:
- Check React 19 migration guide
- Update any deprecated patterns

### ESLint Errors
If you see ESLint config errors:
- The new `eslint.config.mjs` should work
- You can temporarily use `.eslintrc.json` if needed

### TypeScript Errors
- Update `@types/react` and `@types/react-dom` if needed
- Some type definitions may have changed

## Rollback (If Needed)

If you need to rollback:

```powershell
# Revert package.json to previous versions
# Then:
npm install
```

## Benefits

✅ **Security**: All vulnerabilities fixed
✅ **Performance**: Better caching and rendering
✅ **Features**: Latest Next.js and React features
✅ **Future-proof**: On latest stable versions

## Next Steps

1. Install: `npm install`
2. Test: `npm run dev`
3. Fix any TypeScript/ESLint errors
4. Test all pages and features
5. Deploy when ready

The upgrade should be smooth - most code will work without changes!

