// Installation operations must not rely on a POSIX shell on Windows.
export function npmInstallCommand(platform=process.platform){
 const args=['install','--ignore-scripts','--omit=dev','--no-audit','--no-fund'];
 return platform==='win32'
  ?{exe:'cmd.exe',args:['/d','/s','/c',`npm ${args.join(' ')}`]}
  :{exe:'npm',args};
}
