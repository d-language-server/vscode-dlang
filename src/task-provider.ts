'use strict';

import * as vsc from 'vscode';

export default class DubTaskProvider implements vsc.TaskProvider {
    provideTasks(token?: vsc.CancellationToken | undefined): vsc.ProviderResult<vsc.Task[]> {
        let defaultTaskDefinitions = [new DubTaskDefinition('build'), new DubTaskDefinition('test')];
        let tasksConfig = vsc.workspace.getConfiguration('tasks');
        let result: vsc.Task[] = [];
        let config = vsc.workspace.getConfiguration('d');

        result = (tasksConfig.tasks || defaultTaskDefinitions).map((taskDef: DubTaskDefinition) => {
            let args = [config.get('dubPath', 'dub'), taskDef.task];

            for (let option of ['build', 'config', 'compiler', 'arch']) {
                if (option in taskDef) {
                    args.push(`--${option}=${taskDef[option]}`);
                }
            }

            let execution = new vsc.ShellExecution(args.join(' '));
            let task = new vsc.Task(taskDef, taskDef.task, 'dub', execution, ['$dub-build', '$dub-test']);
            task.group = taskDef.task === 'build' ? vsc.TaskGroup.Build : vsc.TaskGroup.Test;
            return task;
        });

        return result;
    }

    resolveTask(task: vsc.Task, token?: vsc.CancellationToken | undefined): vsc.ProviderResult<vsc.Task> {
        return task;
    }
}

class DubTaskDefinition implements vsc.TaskDefinition {
    type = 'dub';
    [name: string]: string | undefined;

    constructor(public task: DubTask, public build?: string, public config?: string, public compiler?: DubCompiler, public arch?: string) {
    }
}

type DubTask = 'build' | 'test';
type DubCompiler = 'dmd' | 'ldc2' | 'gdc';
