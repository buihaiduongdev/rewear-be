import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceRoot = new URL('../../src/', import.meta.url);
const modules = new Map();
const require = createRequire(import.meta.url);

// Only framework-free local source modules belong in these isolated tests.
async function moduleUrl(url, ancestors = new Set()) {
  const location = relative(fileURLToPath(sourceRoot), fileURLToPath(url));
  if (
    isAbsolute(location) ||
    location.startsWith('..') ||
    !location.endsWith('.ts')
  )
    throw new Error('Unsupported TypeScript source: ' + url.href);
  if (ancestors.has(url.href))
    throw new Error('Circular test dependency: ' + url.href);
  if (!modules.has(url.href)) {
    modules.set(
      url.href,
      (async () => {
        let source = stripTypeScriptTypes(await readFile(url, 'utf8'));
        const dependencies = [
          ...source.matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g),
        ];
        for (const [statement, specifier] of dependencies) {
          if (specifier === 'ms') {
            const resolved = pathToFileURL(require.resolve('ms')).href;
            source = source.replace(
              statement,
              statement.replace(specifier, resolved),
            );
            continue;
          }
          let dependency;
          if (specifier.startsWith('@/'))
            dependency = new URL(specifier.slice(2), sourceRoot);
          else if (specifier.startsWith('.'))
            dependency = new URL(specifier, url);
          else throw new Error('Unsupported dependency: ' + specifier);
          if (!dependency.pathname.endsWith('.ts'))
            dependency.pathname += '.ts';
          const resolved = await moduleUrl(
            dependency,
            new Set([...ancestors, url.href]),
          );
          source = source.replace(
            statement,
            statement.replace(specifier, resolved),
          );
        }
        return (
          'data:text/javascript;base64,' +
          Buffer.from(source).toString('base64')
        );
      })(),
    );
  }
  return modules.get(url.href);
}

export async function loadTypeScriptModule(url) {
  return import(await moduleUrl(url));
}
