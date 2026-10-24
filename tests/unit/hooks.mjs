// Node module hooks for unit tests: lets plain Node run the app's src/lib files.
//  * imports without ".js" (as React Native allows) are resolved to the .js file
//  * phone-only packages (react-native, expo-*, AsyncStorage, Supabase client) are replaced by small fakes in ./stubs
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const stub = (f) => pathToFileURL(path.join(here, 'stubs', f)).href;
const STUBS = {
  'react-native': 'react-native.mjs', react: 'react.mjs', '@react-native-async-storage/async-storage': 'async-storage.mjs',
  'react-native-get-random-values': 'empty.mjs', 'aes-js': 'empty.mjs', '@supabase/supabase-js': 'empty.mjs',
  'expo-secure-store': 'expo.mjs', 'expo-notifications': 'expo.mjs', 'expo-location': 'expo.mjs', 'expo-print': 'expo.mjs',
  'expo-sharing': 'expo.mjs', 'expo-file-system/legacy': 'expo.mjs', 'expo-file-system': 'expo.mjs', 'expo-image-manipulator': 'expo.mjs',
};

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: stub(STUBS[specifier]), shortCircuit: true };
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (base.endsWith(path.join('src', 'lib', 'supabase')) || base.endsWith(path.join('src', 'lib', 'supabase.js'))) return { url: stub('supabase.mjs'), shortCircuit: true };
    if (!path.extname(base) && existsSync(base + '.js')) return { url: pathToFileURL(base + '.js').href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  if (url.startsWith('file:') && url.includes('/src/') && url.endsWith('.js')) return next(url, { ...context, format: 'module' });
  return next(url, context);
}
