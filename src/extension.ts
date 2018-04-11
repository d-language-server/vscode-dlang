'use strict';

import * as fs from 'fs';
import * as p from 'path';
import * as cp from 'child_process';
import * as vsc from 'vscode';
import * as lc from 'vscode-languageclient';

export function activate(context: vsc.ExtensionContext) {
    let path = vsc.workspace.getConfiguration('d').get<string>('dlsPath')
        || context.globalState.get('dlsPath') || '';

    if (path.length) {
        if (process.platform === 'win32' && !path.endsWith('.exe')) {
            path += '.exe';
        }

        try {
            if (fs.statSync(path).isFile()) {
                return launchServer(context, path);
            }
        } catch (err) {
        }

        context.globalState.update('dlsPath', '');
    }

    path = '';

    let dub = vsc.workspace.getConfiguration('d').get<string>('dubPath') || 'dub';
    let options: vsc.ProgressOptions = {
        location: vsc.ProgressLocation.Notification,
        title: 'Building DLS... (this might take a few minutes)',
        cancellable: false
    };

    return vsc.window.withProgress(options, (progress) =>
        new Promise(resolve => cp.spawn(dub, ['fetch', 'dls']).on('exit', resolve))
            .then(() => new Promise(resolve => cp.spawn(dub, ['run', '--quiet', 'dls:find'])
                .stdout.on('data', data => path += data.toString())
                .on('end', resolve)
            ))
            .then(() => new Promise(resolve => cp.spawn(dub, ['build', '--build=release']
                .concat(process.platform === 'win32' ? ['--arch=x86_mscoff'] : []), { cwd: path })
                .on('exit', resolve)
            ))
            .then(() => launchServer(context, p.join(path, 'dls'))));
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
