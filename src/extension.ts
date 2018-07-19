'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import * as lc from 'vscode-languageclient';

export function activate(context: vsc.ExtensionContext) {
    let dlsPath = vsc.workspace.getConfiguration('d').get<string>('dlsPath')
        || getDlsPath()
        || context.globalState.get<string>('dlsPath')
        || '';

    if (dlsPath.length) {
        try {
            if (fs.statSync(dlsPath).isFile()) {
                return launchServer(context, dlsPath);
            }
        } catch (err) {
        }
    }

    dlsPath = '';

    let dub = vsc.workspace.getConfiguration('d').get<string>('dubPath') || 'dub';
    let options: vsc.ProgressOptions = {
        location: vsc.ProgressLocation.Notification,
        title: 'Installing DLS...',
        cancellable: false
    };

    return vsc.window.withProgress(options, (progress) =>
        new Promise(resolve => cp.spawn(dub, ['fetch', 'dls']).on('exit', resolve))
            .then(() => new Promise(resolve => {
                let bootstrap = cp.spawn(dub, ['run', '--quiet', 'dls:bootstrap', '--', '--progress']);
                let totalSize = 0;
                let currentSize = 0;
                bootstrap.stdout.on('data', data => dlsPath += data.toString())
                    .on('end', resolve);
                rl.createInterface(bootstrap.stderr)
                    .on('line', (line: string) => {
                        const size = Number(line);

                        if (line === 'extract') {
                            progress.report({ message: 'Extracting DLS...' });
                        } else if (totalSize === 0) {
                            totalSize = size;
                        } else {
                            currentSize = size;
                            progress.report({
                                increment: 100 * (size - currentSize) / totalSize,
                                message: `Downloading...`
                            });
                        }
                    });
            }))
            .then(() => launchServer(context, dlsPath)));
}

export function deactivate() {
}

function getDlsPath() {
    const isWindows = process.platform === 'win32';
    return path.join(<string>process.env[isWindows ? 'LOCALAPPDATA' : 'HOME'],
        isWindows ? 'dub' : '.dub',
        'packages', '.bin',
        isWindows ? 'dls.exe' : 'dls');
}

function launchServer(context: vsc.ExtensionContext, dlsPath: string) {
    const serverOptions: lc.ServerOptions = { command: dlsPath };
    const clientOptions: lc.LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'd' }],
        synchronize: { configurationSection: 'd.dls' }
    };
    const client = new lc.LanguageClient('vscode-dls', 'D Language', serverOptions, clientOptions);
    client.onReady().then(() => {
        {
            let task: vsc.Progress<{ increment?: number, message?: string }>;
            let totalSize = 0;
            let currentSize = 0;
            let resolve: lc.GenericNotificationHandler;

            client.onNotification('$/dls.upgradeDls.start',
                (params: TranslationParams | null) => vsc.window.withProgress({
                    location: vsc.ProgressLocation.Notification,
                    title: params ? params.tr : 'Upgrading DLS...'
                }, t => new Promise(r => { task = t; resolve = r; })));
            client.onNotification('$/dls.upgradeDls.totalSize', (params: DlsUpgradeSizeParams | number) => {
                totalSize = typeof (params) !== 'number' ? params.size : params;
            });
            client.onNotification('$/dls.upgradeDls.currentSize', (params: DlsUpgradeSizeParams | number) => {
                let size = typeof (params) !== 'number' ? params.size : params;
                task.report({
                    increment: 100 * (size - currentSize) / totalSize,
                    message: typeof (params) !== 'number' ? params.tr : `Downloading...`
                });
                currentSize = size;
            });
            client.onNotification('$/dls.upgradeDls.extract',
                (params: TranslationParams | null) => task.report({ message: params ? params.tr : 'Extracting...' }));
            client.onNotification('$/dls.upgradeDls.stop', () => resolve());
        }

        {
            let resolve: lc.GenericNotificationHandler;

            client.onNotification('$/dls.upgradeSelections.start',
                (params: TranslationParams | null) => vsc.window.withProgress({
                    location: vsc.ProgressLocation.Notification,
                    title: params ? params.tr : 'Upgrading selections...'
                }, t => new Promise(r => resolve = r)));
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
