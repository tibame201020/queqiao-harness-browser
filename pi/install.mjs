#!/usr/bin/env node
// Explicit user-local Pi extension installation; never touches a repository or browser profile.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {npmInstallCommand} from './install-platform.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
if(args.some(x=>!['--dest','--skip-deps'].includes(x)&&args[args.indexOf('--dest')+1]!==x))throw Error('Usage: node pi/install.mjs [--dest /absolute/path] [--skip-deps]');
const destArg=args.indexOf('--dest');
const dest=destArg>=0?args[destArg+1]:path.join(os.homedir(),'.pi','agent','extensions','queqiao-chatgpt');
if(!path.isAbsolute(dest||''))throw Error('INVALID_INSTALL_DESTINATION');
fs.mkdirSync(dest,{recursive:true,mode:0o700});
const files=[['extension.mjs','index.ts'],['web-ask-core.mjs','web-ask-core.mjs'],['chatgpt-core.mjs','chatgpt-core.mjs'],['orca-cli.mjs','orca-cli.mjs'],['web-providers.mjs','web-providers.mjs'],['commands.mjs','commands.mjs']];
for(const [src,target] of files){
 const out=path.join(dest,target);
 if(fs.existsSync(out)&&fs.lstatSync(out).isSymbolicLink())throw Error('INSTALL_SYMLINK_DENIED');
 fs.copyFileSync(path.join(here,src),out);
 fs.chmodSync(out,0o600);
}
// Migration from the old Browser Harness Pi transport: remove only the
// known, tool-owned legacy module. Never remove an unrelated user file.
const legacy=path.join(dest,'windows-runner.mjs');
if(fs.existsSync(legacy)&&fs.lstatSync(legacy).isFile()){
 const source=fs.readFileSync(legacy,'utf8');
 if(source.startsWith('// WSL transport to the already installed Windows Browser Harness Runner.')&&
    source.includes('export function createWindowsHarnessTransport'))fs.rmSync(legacy);
}
const pkg={name:'queqiao-pi-chatgpt-local',private:true,type:'module',dependencies:{typebox:'1.3.7'}};
fs.writeFileSync(path.join(dest,'package.json'),JSON.stringify(pkg,null,2)+'\n',{mode:0o600});
if(!args.includes('--skip-deps')){const command=npmInstallCommand();execFileSync(command.exe,command.args,{cwd:dest,stdio:'ignore',timeout:120000})}
console.log(JSON.stringify({status:'PI_CHATGPT_EXTENSION_INSTALLED',destination:dest,dependencyInstalled:!args.includes('--skip-deps')}));
