import React from 'react';
export default function dynamic(importFn: any, options: any) { const LazyComponent = React.lazy(importFn); return function DynamicComponent(props: any) { return <React.Suspense fallback={options?.loading ? <options.loading /> : null}><LazyComponent {...props} /></React.Suspense>; }; }
