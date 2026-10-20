import { expect, it } from 'vitest';
import { benchmarkLaunch } from '../scripts/benchmark-launch.mjs';
it('artifact performance measurements launch the supplied release, never the developer checkout', () => {
 const target='D:/stage/Enlumor.exe';
 expect(benchmarkLaunch(target,'D:/checkout')).toEqual({executablePath:target,args:[]});
 expect(benchmarkLaunch(undefined,'D:/checkout')).toEqual({args:['D:/checkout']});
});
