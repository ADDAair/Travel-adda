// Static check run in CI: undefined names, imports of names a file does not export, missing files.
const parser=require('@babel/parser');const b={babelParse:(code)=>parser.parse(code,{sourceType:'module',plugins:['jsx']}),traverse:require('@babel/traverse')};
const fs=require('fs'),path=require('path');
const traverse=b.traverse.default||b.traverse;
const GLOBALS=new Set('console,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Object,Array,String,Number,Math,Date,JSON,Error,Set,Map,global,globalThis,fetch,require,module,process,Intl,isNaN,parseInt,parseFloat,encodeURIComponent,decodeURIComponent,Symbol,RegExp,Boolean,Infinity,NaN,undefined,Uint8Array,ArrayBuffer,crypto,__DEV__,URL,Buffer,TextEncoder,TextDecoder,atob,btoa,requestAnimationFrame,cancelAnimationFrame,window,document,navigator,arguments,WeakMap,Reflect,Proxy,BigInt,queueMicrotask,AbortController,FormData,Blob'.split(','));
const files=[];const tsFiles=[];(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(f==='node_modules'||f.startsWith('.')||f==='tools'||f==='tests')continue;if(fs.statSync(p).isDirectory())walk(p);else if(p.endsWith('.js'))files.push(p);else if((p.endsWith('.ts')||p.endsWith('.tsx'))&&!p.endsWith('.d.ts'))tsFiles.push(p);}})('.');
const exportsOf={};const asts={};
for(const f of files){const ast=b.babelParse(fs.readFileSync(f,'utf8'),f,true);asts[f]=ast;const ex=new Set();
 for(const n of ast.program.body){if(n.type==='ExportNamedDeclaration'){if(n.declaration){const d=n.declaration;if(d.id)ex.add(d.id.name);if(d.declarations)d.declarations.forEach(x=>ex.add(x.id.name));}(n.specifiers||[]).forEach(s=>ex.add(s.exported.name));}if(n.type==='ExportDefaultDeclaration')ex.add('default');}
 exportsOf[path.resolve(f)]=ex;}
// TypeScript modules (checked by tsc themselves): record their value exports so JavaScript files that import them
// are still checked for wrong names (tsc does not check the .js files).
for(const f of tsFiles){const ex=new Set();const src=fs.readFileSync(f,'utf8');
 for(const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm))ex.add(m[1]);
 for(const m of src.matchAll(/^export\s*\{([^}]*)\}/gm))m[1].split(',').map(x=>x.trim().split(/\s+as\s+/).pop()).filter(x=>x&&!x.startsWith('type ')).forEach(x=>ex.add(x));
 if(/^export\s+default\b/m.test(src))ex.add('default');
 exportsOf[path.resolve(f).replace(/\.tsx?$/,'.js')]=ex;}
let issues=0;
for(const f of files){const ast=asts[f];
 traverse(ast,{Program(p){
   // undeclared refs
   p.traverse({ReferencedIdentifier(q){const n=q.node.name;if(q.parentPath.isJSXMemberExpression())return; if(q.isJSXIdentifier()&&/^[a-z]/.test(n))return; if(!q.scope.hasBinding(n)&&!GLOBALS.has(n)){console.log(`UNDEF ${f}:${q.node.loc.start.line} ${n}`);issues++;}}});
   // unused imports / top-level
   for(const [name,bind] of Object.entries(p.scope.bindings)){if(!bind.referenced&&bind.kind==='module'&&name!=='React'){console.log(`UNUSED-IMPORT ${f} ${name}`);}}
 }});
 for(const n of ast.program.body){if(n.type!=='ImportDeclaration'||!n.source.value.startsWith('.'))continue;let t=path.resolve(path.dirname(f),n.source.value);if(!t.endsWith('.js'))t+='.js';const ex=exportsOf[t];if(!ex){if(!fs.existsSync(t))console.log(`MISSING-FILE ${f} ${n.source.value}`);continue;}
  for(const s of n.specifiers){const nm=s.type==='ImportDefaultSpecifier'?'default':s.type==='ImportNamespaceSpecifier'?null:s.imported.name;if(nm&&!ex.has(nm)){console.log(`BAD-IMPORT ${f} ${nm} from ${n.source.value}`);issues++;}}}
}
console.log('files',files.length,'issues',issues);if(issues)process.exit(1);
