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
        title: 'Installing DLS... (this might take a few minutes)',
        cancellable: false
    };

    return vsc.window.withProgress(options, (progress) =>
        new Promise(resolve => cp.spawn(dub, ['fetch', 'dls']).on('exit', resolve))
            .then(() => new Promise(resolve => {
                let bootstrap = cp.spawn(dub, ['run', '--quiet', 'dls:bootstrap', '--', '--progress']);
                bootstrap.stdout.on('data', data => dlsPath += data.toString())
                    .on('end', resolve);
                rl.createInterface(bootstrap.stderr)
                    .on('line', (line: number) => progress.report({ increment: line }));
            }))
            .then(() => launchServer(context, dlsPath)));
}

export function deactivate() {
}

function getDlsPath() {
    const isWindows = process.platform === 'win32';
    return path.join(process.env[isWindows ? 'LOCALAPPDATA' : 'HOME'],
        isWindows ? 'dub' : '.dub',
        'packages', '.bin',
        isWindows ? 'dls.exe' : 'dls');
}

function launchServer(context: vsc.ExtensionContext, dlsPath: string) {
    const serverOptions: lc.ServerOptions = { command: dlsPath };
    const clientOptions: lc.LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'd' }],
        synchronize: { configurationSection: 'd.dls' },
        initializationOptions: {
            lspExtensions: {
                upgradeProgress: true
            }
        }
    };
    const client = new lc.LanguageClient('vscode-dls', 'D Language', serverOptions, clientOptions);
    client.onReady().then(() => {
        let options: vsc.ProgressOptions = {
            location: vsc.ProgressLocation.Notification,
            title: 'Upgrading DLS...',
            cancellable: false
        };
        let task: vsc.Progress<{ increment: number, message: string }>;
        let total = 0;
        let resolve: lc.GenericNotificationHandler;
        let updatePath = (path: string) => vsc.workspace.getConfiguration('d').update('dlsPath', path, vsc.ConfigurationTarget.Global);
        client.onNotification('$/dls.upgradeDls.start', () => vsc.window.withProgress(options, t => new Promise(r => { task = t; resolve = r })));
        client.onNotification('$/dls.upgradeDls.progress', (progress: number) => {
            task.report({ increment: progress, message: `Upgrading DLS [${total}%]` });
            total += progress;
        });
        client.onNotification('$/dls.upgradeDls.stop', () => resolve());
        client.onNotification('dls/didUpdatePath', updatePath);
    });
    context.subscriptions.push(client.start());
}
