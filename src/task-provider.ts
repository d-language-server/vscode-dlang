'use strict';

import * as vsc from 'vscode';
import * as util from './util';

export default class DubTaskProvider implements vsc.TaskProvider {
    provideTasks(token?: vsc.CancellationToken | undefined): vsc.ProviderResult<vsc.Task[]> {
        let defaultTaskDefinitions = [new DubTaskDefinition('build'), new DubTaskDefinition('test')];
        let tasksConfig = vsc.workspace.getConfiguration('tasks');
        let result: vsc.Task[] = [];

        result = (tasksConfig.tasks || defaultTaskDefinitions)
        .filter((taskDef: DubTaskDefinition) => taskDef.type === 'dub' )
        .map((taskDef: DubTaskDefinition) => {
            let args = [util.dub, taskDef.task];

            for (let option of ['build', 'config', 'compiler', 'arch']) {
                if (option in taskDef) {
                    if (taskDef[option]) {
                        args.push(`--${option}=${taskDef[option]}`);
                    }
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
