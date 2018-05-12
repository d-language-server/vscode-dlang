'use strict';

import * as fs from 'fs';
import * as cp from 'child_process';
import * as vsc from 'vscode';
import * as lc from 'vscode-languageclient';

export function activate(context: vsc.ExtensionContext) {
    let dlsPath = vsc.workspace.getConfiguration('d').get<string>('dlsPath')
        || context.globalState.get<string>('dlsPath') || '';

    if (dlsPath.length) {
        try {
            if (fs.statSync(dlsPath).isFile()) {
                return launchServer(context, dlsPath);
            }
        } catch (err) {
        }

        context.globalState.update('dlsPath', '');
    }

    dlsPath = '';

    let dub = vsc.workspace.getConfiguration('d').get<string>('dubPath') || 'dub';
    let options: vsc.ProgressOptions = {
        location: vsc.ProgressLocation.Notification,
        title: 'Building DLS... (this might take a few minutes)',
        cancellable: false
    };

    return vsc.window.withProgress(options, (progress) =>
        new Promise(resolve => cp.spawn(dub, ['fetch', 'dls']).on('exit', resolve))
            .then(() => new Promise(resolve => cp.spawn(dub, ['run', '--quiet', 'dls:bootstrap'])
                .stdout.on('data', data => dlsPath += data.toString())
                .on('end', resolve)
            ))
            .then(() => launchServer(context, dlsPath)));
}

export function deactivate() {
}

function launchServer(context: vsc.ExtensionContext, dlsPath: string) {
    const serverOptions: lc.ServerOptions = { command: dlsPath };
    const clientOptions: lc.LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'd' }],
        synchronize: { configurationSection: 'd.dls' }
    };
    const client = new lc.LanguageClient('vscode-dls', 'D Language', serverOptions, clientOptions);
    client.onReady().then(() => {
        let updatePath = (path: string) => context.globalState.update('dlsPath', path);
        client.onTelemetry(updatePath);
        client.onNotification('dls/didUpdatePath', updatePath);
    });
    context.subscriptions.push(client.start());
}
