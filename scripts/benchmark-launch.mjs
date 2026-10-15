export function benchmarkLaunch(executable, root) {
  return executable ? { executablePath: executable, args: [] } : { args: [root] };
}
