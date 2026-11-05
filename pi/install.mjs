#!/usr/bin/env node
// Explicit user-local Pi extension installation; never touches a repository or browser profile.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
if(args.some(x=>!['--dest','--skip-deps'].includes(x)&&args[args.indexOf('--dest')+1]!==x))throw Error('Usage: node pi/install.mjs [--dest /absolute/path] [--skip-deps]');
const destArg=args.indexOf('--dest');
const dest=destArg>=0?args[destArg+1]:path.join(os.homedir(),'.pi','agent','extensions','queqiao-chatgpt');
if(!path.isAbsolute(dest||''))throw Error('INVALID_INSTALL_DESTINATION');
fs.mkdirSync(dest,{recursive:true,mode:0o700});
const files=[['extension.mjs','index.ts'],['chatgpt-core.mjs','chatgpt-core.mjs'],['windows-runner.mjs','windows-runner.mjs']];
for(const [src,target] of files){
 const out=path.join(dest,target);
 if(fs.existsSync(out)&&fs.lstatSync(out).isSymbolicLink())throw Error('INSTALL_SYMLINK_DENIED');
 fs.copyFileSync(path.join(here,src),out);
 fs.chmodSync(out,0o600);
}
const pkg={name:'queqiao-pi-chatgpt-local',private:true,type:'module',dependencies:{typebox:'1.3.7'}};
fs.writeFileSync(path.join(dest,'package.json'),JSON.stringify(pkg,null,2)+'\n',{mode:0o600});
if(!args.includes('--skip-deps'))execFileSync('npm',['install','--ignore-scripts','--omit=dev','--no-audit','--no-fund'],{cwd:dest,stdio:'ignore',timeout:120000});
console.log(JSON.stringify({status:'PI_CHATGPT_EXTENSION_INSTALLED',destination:dest,dependencyInstalled:!args.includes('--skip-deps')}));
