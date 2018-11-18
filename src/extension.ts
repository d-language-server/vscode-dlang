'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as net from 'net';
import * as vsc from 'vscode';
import * as lc from 'vscode-languageclient';
import * as util from './util';
import DubTaskProvider from './task-provider';

let socket: net.Socket;

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

    let options: vsc.ProgressOptions = { location: vsc.ProgressLocation.Notification, title: 'Installing DLS' };

    if (!util.dub) {
        vsc.window.showErrorMessage('Dub not found in PATH');
        return;
    }

    if (!util.compiler) {
        vsc.window.showErrorMessage('No compiler found in PATH');
        return;
    }

    return vsc.window.withProgress(options, (progress) =>
        new Promise(resolve => cp.spawn(util.dub!, ['remove', '--version=*', 'dls']).on('exit', resolve))
            .then(() => new Promise(resolve => cp.spawn(util.dub!, ['fetch', 'dls']).on('exit', resolve)))
            .then(() => new Promise(resolve => {
                let args = ['run', '--compiler=' + util.compiler, '--quiet', 'dls:bootstrap'];

                if (util.isWindows && util.compiler === 'ldc2.exe' && process.arch === 'x64') {
                    args.push('--arch=x86_64');
                }

                args.push('--', '--progress');

                let bootstrap = cp.spawn(util.dub!, args);
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
    let dlsExecutable = util.executableName('dls');
    let dlsDir = path.join(<string>process.env[util.isWindows ? 'LOCALAPPDATA' : 'HOME'],
        util.isWindows ? 'dub' : '.dub',
        'packages', '.bin');

    try {
        let dls = path.join(dlsDir, 'dls-latest', dlsExecutable);
        fs.statSync(dls);
        return dls;
    } catch (err) {
        return path.join(dlsDir, dlsExecutable);
    }
}

function launchServer(context: vsc.ExtensionContext, dlsPath: string) {
    const serverOptions: lc.ServerOptions = vsc.workspace.getConfiguration('d').get('connectionType') === 'stdio'
        ? { command: dlsPath }
        : () => createServerWithSocket(dlsPath).then(() => ({ reader: socket, writer: socket }));
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

            client.onNotification('$/dls/upgradeDls/didStart',
                (params: TranslationParams) => vsc.window.withProgress({
                    location: vsc.ProgressLocation.Notification,
                    title: params.tr
                }, t => new Promise(r => { task = t; resolve = r; })));
            client.onNotification('$/dls/upgradeDls/didStop', () => resolve());
            client.onNotification('$/dls/upgradeDls/didChangeTotalSize', (params: DlsUpgradeSizeParams) => totalSize = params.size);
            client.onNotification('$/dls/upgradeDls/didChangeCurrentSize', (params: DlsUpgradeSizeParams) => {
                task.report({
                    increment: 100 * (params.size - currentSize) / totalSize,
                    message: params.tr
                });
                currentSize = params.size;
            });
            client.onNotification('$/dls/upgradeDls/didExtract',
                (params: TranslationParams) => task.report({ message: params.tr }));
        }

        {
            let resolve: lc.GenericNotificationHandler;

            client.onNotification('$/dls/upgradeSelections/didStart',
                (params: TranslationParams) => vsc.window.withProgress({
                    location: vsc.ProgressLocation.Notification,
                    title: params.tr
                }, () => new Promise(r => resolve = r)));
            client.onNotification('$/dls/upgradeSelections/didStop', () => resolve());
        }
    });
    context.subscriptions.push(client.start());
}

function createServerWithSocket(dlsPath: string) {
    let dls: cp.ChildProcess;
    return new Promise<cp.ChildProcess>(resolve => {
        let server = net.createServer(s => {
            socket = s;
            server.close();
            resolve(dls);
        });

        server.listen(0, '127.0.0.1', () => {
            dls = cp.spawn(dlsPath, ['--socket=' + server.address().port]);
        });
    });
}

interface TranslationParams {
    tr: string;
}

interface DlsUpgradeSizeParams extends TranslationParams {
    size: number;
}
