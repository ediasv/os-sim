// TypeScript 7 is a native binary without the JS API vue-tsc patches, so run
// vue-tsc against the TypeScript 6 copy installed as `typescript-6`.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('vue-tsc').run(require.resolve('typescript-6/lib/tsc'));
