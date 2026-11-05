// WSL transport to the already installed Windows Browser Harness Runner.
// The Browser Harness owns the DOM, authentication, original send receipts, and collect.
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';

const PID_PREFIX='__QUEQIAO_PI_WIN_PID__';
export function makeWindowsRunnerInput(runnerPath,command,payload){
  if(!/^[A-Za-z]:\\[^'"`\r\n]+\.js$/i.test(runnerPath))throw Error('INVALID_RUNNER_PATH');
  if(!['status','run','init'].includes(command))throw Error('INVALID_RUNNER_COMMAND');
  const encoded=Buffer.from(JSON.stringify(payload),'utf8').toString('base64url');
  const preload='import {readFileSync} from "node:fs";process.argv[3]=readFileSync(0,"utf8").trim();';
  const preloadUrl='data:text/javascript;base64,'+Buffer.from(preload,'utf8').toString('base64');
  const psArgs=`--import "${preloadUrl}" "${runnerPath}" ${command}`;
  const cwd=path.win32.dirname(runnerPath);
  const script=`$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); `+
    `$psi=New-Object System.Diagnostics.ProcessStartInfo; $psi.FileName='node.exe'; $psi.Arguments='${psArgs}'; `+
    `$psi.WorkingDirectory='${cwd}'; $psi.UseShellExecute=$false; `+
    `$psi.RedirectStandardInput=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true; `+
    `$psi.StandardOutputEncoding=[System.Text.Encoding]::UTF8; $psi.StandardErrorEncoding=[System.Text.Encoding]::UTF8; `+
    `$p=[System.Diagnostics.Process]::Start($psi); Write-Output ('${PID_PREFIX}'+$p.Id); `+
    `$p.StandardInput.WriteLine('${encoded}'); $p.StandardInput.Close(); `+
    `$stdout=$p.StandardOutput.ReadToEndAsync(); $stderr=$p.StandardError.ReadToEndAsync(); `+
    `$p.WaitForExit(); $out=$stdout.GetAwaiter().GetResult(); $err=$stderr.GetAwaiter().GetResult(); `+
    `if($out){[Console]::Out.WriteLine($out)}; if($err){[Console]::Error.WriteLine($err)}; exit $p.ExitCode`;
  return {args:['-NoProfile','-NonInteractive','-Command','-'],input:script+'\r\n'};
}
export function createWindowsHarnessTransport({runnerPath,powershellExe='/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',taskkillExe='/mnt/c/Windows/System32/taskkill.exe',spawnProcess=spawn,killProcess=spawnSync,signal}={}){
  return {run(command,payload,{signal:callSignal}={}){
    const activeSignal=callSignal??signal;
    const invocation=makeWindowsRunnerInput(runnerPath,command,payload);
    return new Promise((resolve,reject)=>{
      const child=spawnProcess(powershellExe,invocation.args,{stdio:['pipe','pipe','pipe']});
      let stdout='',stderr='',winPid=null,settled=false,closed=false;
      const timeout=setTimeout(()=>finish(Error('WINDOWS_HARNESS_TIMEOUT')),command==='status'?30000:160000);
      const terminate=()=>{
        if(closed)return;
        if(winPid)killProcess(taskkillExe,['/PID',String(winPid),'/T','/F'],{timeout:10000,encoding:'utf8',maxBuffer:128000});
        child.kill('SIGTERM');
      };
      const onAbort=()=>finish(Error('WINDOWS_HARNESS_ABORTED'));
      const finish=(error,value)=>{
        if(settled)return;settled=true;clearTimeout(timeout);activeSignal?.removeEventListener('abort',onAbort);
        if(error){terminate();reject(error)}else resolve(value);
      };
      activeSignal?.addEventListener('abort',onAbort,{once:true});
      child.stdout.on('data',chunk=>{
        stdout+=String(chunk);
        if(stdout.length>100000)return finish(Error('HARNESS_OUTPUT_LIMIT'));
        const match=stdout.match(/__QUEQIAO_PI_WIN_PID__(\d+)/);
        if(match)winPid=Number(match[1]);
      });
      child.stderr.on('data',chunk=>{stderr+=String(chunk);if(stderr.length>12000)finish(Error('HARNESS_STDERR_LIMIT'))});
      child.on('error',()=>finish(Error('HARNESS_PROCESS_UNAVAILABLE')));
      child.on('close',code=>{
        closed=true;
        if(code!==0)return finish(Error('HARNESS_RUNNER_FAILED'));
        try{const obj=JSON.parse(stdout.trim().split(/\r?\n/).at(-1));finish(null,obj)}
        catch{finish(Error('HARNESS_INVALID_RECEIPT'))}
      });
      if(activeSignal?.aborted)return onAbort();
      child.stdin.on('error',()=>finish(Error('HARNESS_STDIN_FAILED')));
      child.stdin.end(invocation.input);
    });
  }};
}

export function withSharedBrowserLock(lockFile,fn,{spawnProcess=spawn,signal}={}){
  if(!path.isAbsolute(lockFile||''))throw Error('INVALID_BROWSER_LOCK');
  return new Promise((resolve,reject)=>{
    const child=spawnProcess('flock',['-x','-w','90',lockFile,'bash','-c','echo __PI_LOCK_HELD__; cat >/dev/null'],{stdio:['pipe','pipe','pipe']});
    let ready=false,done=false;
    const timeout=setTimeout(()=>finish(Error('BROWSER_LOCK_TIMEOUT')),95000);
    const onAbort=()=>{if(!ready)finish(Error('BROWSER_LOCK_ABORTED'))};
    function finish(error,value){if(done)return;done=true;clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);child.stdin.end();if(error)reject(error);else resolve(value)}
    signal?.addEventListener('abort',onAbort,{once:true});
    child.stdout.on('data',chunk=>{
      if(ready||!String(chunk).includes('__PI_LOCK_HELD__'))return;
      ready=true;
      if(signal?.aborted)return onAbort();
      Promise.resolve().then(fn).then(value=>finish(null,value),error=>finish(error));
    });
    child.on('error',()=>finish(Error('BROWSER_LOCK_UNAVAILABLE')));
    child.on('exit',()=>{if(!ready)finish(Error('BROWSER_LOCK_UNAVAILABLE'))});
    if(signal?.aborted)onAbort();
  });
}
