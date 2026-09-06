import React from 'react';

// React.lazy requires the promise to resolve to `{ default: Component }`.
// Import thunks in this codebase may instead resolve to the component
// directly, or to a CJS/ESM interop namespace whose `.default` chain hides
// the component — normalize all of those shapes here.
export default function dynamic(importFn: any, options: any) {
  const LazyComponent = React.lazy(async () => {
    let value: any = await importFn();
    let guard = 0;
    while (value && typeof value === 'object' && 'default' in value && guard < 5) {
      value = value.default;
      guard += 1;
    }
    // memo()/forwardRef() components are objects with a React `$$typeof` symbol.
    const isReactComponent =
      typeof value === 'function' ||
      (value && typeof value === 'object' && typeof value.$$typeof === 'symbol');
    if (!isReactComponent) {
      throw new Error('Lazy import did not resolve to a React component');
    }
    return { default: value };
  });
  return function DynamicComponent(props: any) {
    return <React.Suspense fallback={options?.loading ? <options.loading /> : null}><LazyComponent {...props} /></React.Suspense>;
  };
}
