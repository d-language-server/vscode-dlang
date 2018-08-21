'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import * as lc from 'vscode-languageclient';
import DubTaskProvider from './taskProvider';

const isWindows = process.platform === 'win32';
const dmd = isWindows ? 'dmd.exe' : 'dmd';
const ldc = isWindows ? 'ldc2.exe' : 'ldc2';

export function activate(context: vsc.ExtensionContext) {
    vsc.workspace.registerTaskProvider('dub', new DubTaskProvider());
    let dlsPath = vsc.workspace.getConfiguration('d').get<string>('dlsPath') || getDlsPath();

    if (dlsPath.length) {
        try {
            fs.statSync(dlsPath);
            return launchServer(context, dlsPath);
        } catch (err) {
        }
    }

    dlsPath = '';

    let dub = vsc.workspace.getConfiguration('d').get<string>('dubPath') || 'dub';
    let compiler = getCompiler();
    let options: vsc.ProgressOptions = { location: vsc.ProgressLocation.Notification };

    if (!compiler) {
        vsc.window.showErrorMessage('No compiler found in PATH');
        return;
    }

    return vsc.window.withProgress(options, (progress) =>
        new Promise(resolve => cp.spawn(dub, ['remove', '--version=*', 'dls']).on('exit', resolve))
            .then(() => new Promise(resolve => cp.spawn(dub, ['fetch', 'dls']).on('exit', resolve)))
            .then(() => new Promise(resolve => {
                let args = ['run', '--compiler=' + compiler, '--quiet', 'dls:bootstrap'];

                if (process.arch === 'x64') {
                    args.push('--arch=x86_64');
                }

                args.push('--', '--progress');

                let bootstrap = cp.spawn(dub, args);
                let totalSize = 0;
                let currentSize = 0;

                bootstrap.stdout.on('data', data => dlsPath += data.toString())
                    .on('end', resolve);
                rl.createInterface(bootstrap.stderr)
                    .on('line', (line: string) => {
                        const size = Number(line);

                        if (line === 'extract') {
                            progress.report({ message: 'Extracting' });
                        } else if (totalSize === 0) {
                            totalSize = size;
                        } else {
                            currentSize = size;
                            progress.report({
                                increment: 100 * (size - currentSize) / totalSize,
                                message: `Downloading`
                            });
                        }
                    });
            }))
            .then(() => launchServer(context, dlsPath)));
}

export function deactivate() {
}

function getDlsPath() {
    let dlsExecutable = isWindows ? 'dls.exe' : 'dls';
    let dlsDir = path.join(<string>process.env[isWindows ? 'LOCALAPPDATA' : 'HOME'],
        isWindows ? 'dub' : '.dub',
        'packages', '.bin');

    try {
        let dls = path.join(dlsDir, 'dls-latest', dlsExecutable);
        fs.statSync(dls);
        return dls;
    } catch (err) {
        return path.join(dlsDir, dlsExecutable);
    }
}

function getCompiler() {
    for (let p of process.env['PATH']!.split(isWindows ? ';' : ':')) {
        for (let compiler of [dmd, ldc]) {
            try {
                fs.statSync(path.join(p, compiler))
                return compiler;
            }
            catch (err) {
            }
        }
    }

    return null;
}

function launchServer(context: vsc.ExtensionContext, dlsPath: string) {
    const serverOptions: lc.ServerOptions = { command: dlsPath };
    const clientOptions: lc.LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'd' }],
        synchronize: { configurationSection: 'd.dls' },
        initializationOptions: vsc.workspace.getConfiguration('d').get('init')
    };
    const client = new lc.LanguageClient('vscode-dls', 'DLS', serverOptions, clientOptions);
    client.onReady().then(() => {
        {
            let task: vsc.Progress<{ increment?: number, message?: string }>;
            let totalSize = 0;
            let currentSize = 0;
            let resolve: lc.GenericNotificationHandler;

            client.onNotification('$/dls.upgradeDls.start',
                (params: TranslationParams | null) => vsc.window.withProgress({
                    location: vsc.ProgressLocation.Notification,
                    title: params ? params.tr : 'Upgrading DLS'
                }, t => new Promise(r => { task = t; resolve = r; })));
            client.onNotification('$/dls.upgradeDls.totalSize', (params: DlsUpgradeSizeParams | number) => {
                totalSize = typeof (params) !== 'number' ? params.size : params;
            });
            client.onNotification('$/dls.upgradeDls.currentSize', (params: DlsUpgradeSizeParams | number) => {
                let size = typeof (params) !== 'number' ? params.size : params;
                task.report({
                    increment: 100 * (size - currentSize) / totalSize,
                    message: typeof (params) !== 'number' ? params.tr : `Downloading`
                });
                currentSize = size;
            });
            client.onNotification('$/dls.upgradeDls.extract',
                (params: TranslationParams | null) => task.report({ message: params ? params.tr : 'Extracting' }));
            client.onNotification('$/dls.upgradeDls.stop', () => resolve());
        }

        {
            let resolve: lc.GenericNotificationHandler;

            client.onNotification('$/dls.upgradeSelections.start',
                (params: TranslationParams | null) => vsc.window.withProgress({
                    location: vsc.ProgressLocation.Notification,
                    title: params ? params.tr : 'Upgrading selections'
                }, () => new Promise(r => resolve = r)));
            client.onNotification('$/dls.upgradeSelections.stop', () => resolve());
        }
    });
    context.subscriptions.push(client.start());
}

interface TranslationParams {
    tr: string;
}

interface DlsUpgradeSizeParams extends TranslationParams {
    size: number;
}
