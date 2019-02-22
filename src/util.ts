'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vsc from 'vscode';

export const isWindows = process.platform === 'win32';
export const dub = vsc.workspace.getConfiguration('d').get<string>('dubPath', 'dub') || findInPath(executableName('dub'));
export const compiler = findInPath(executableName('dmd'))
    || findInPath(executableName('ldc2'))
    || findInPath(executableName('gdc'));

export function findInPath(binary: string) {
    for (let p of process.env['PATH']!.split(isWindows ? ';' : ':')) {
        try {
            fs.statSync(path.join(p, binary))
            return binary;
        }
        catch (err) {
        }
    }

    return null;
}

export function executableName(name: string) {
    return isWindows ? name + '.exe' : name;
}
