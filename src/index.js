#!/usr/bin/env node

import * as chalk from 'chalk';
import { spawn, execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import rimraf from 'rimraf';

import message from './message';
import * as constants from './constants';

const commandArgs = {
    npm: {
        install: 'install',
        run: 'run',
        dev: function(deps){
            return ['install', ...deps, '--save-dev'];
        }
    },
    yarn: {
        install: 'install',
        run: '',
        dev: function(deps){
            return ['add', ...deps, '--dev'];
        }
    }
}

function main(argv) {
    let appName = getAppName(argv);

    if (!appName) {
        message.error('App name is not specified.');
        return;
    }

    init(appName).catch(message.error);
}

function getAppName(argv) {
    if (argv.length > 2) {
        return argv[2];
    }

    return '';
}

async function init(appName) {
    let cliPath = __dirname;                            // Directory where CLI is installed.
    let installPath = path.resolve('./');               // Directory where react-native app folder is created.
    let appPath = installPath + '/' + appName;          // Directory where react-native app code is created.

    if (fs.existsSync(appPath)) {
        throw new Error(`${appName} directory already exists.`);
    } else {
        const packageManager = await getPackageManager();
        
        await createApp(appName, installPath)
        await createSourceDirectory(`${appPath}/${constants.SOURCE_FOLDER_NAME}`);
        await copyAssetFiles(`${cliPath}/assets`, appPath);
        await modifyAppFiles(appPath, packageManager);
        await installDevDeps(appPath, packageManager);

        message.success(`${appName} project created successfully.`);
        
        const command = packageManager + (commandArgs[packageManager].run ? ' ' + commandArgs[packageManager].run : '');
        message.info(`Use '${command} android' or '${command} ios' to run.`);
    }
}

/**Returns yarn if installed, otherwise use npm. */
function getPackageManager() {
    return new Promise((resolve, reject) => {
        execFile(getCommand(constants.YARN), ['-v'], (error, stdout, stderr) => {
            if (error) {
                resolve(constants.NPM);
            } else {
                resolve(constants.YARN);
            }
        });
    });
}

function createApp(appName, installpath) {
    return new Promise((resolve, reject) => {
        const defaults = {
            cwd: installpath,
            env: process.env
        };

        let native = spawn(getCommand(constants.REACT_NATIVE), ['init', appName], defaults);
        
        native.stdout.on('data', message.info);
    
        native.stderr.on('data', data => {
            let text = data.toString();
            if (text.startsWith('Error')) {
                message.error(data);
            } else if (text.startsWith('warning')) {
                message.warn(data);
            }
        });
    
        native.on('error', message.error);
    
        native.on('close', code => {
            if (code !== 0) {
                reject(`Child process exited with code ${code}`);
                return;
            }
            
            resolve();
        });
    });
}

function createSourceDirectory(sourceDirectory) {
    return new Promise((resolve, reject) => {
        fs.mkdir(sourceDirectory, error => error ? reject(error) : resolve());
    });
}

function copyAssetFiles(cliAssetsPath, destDir) {
    const appPromise = copyAssetFile('App.tsx', cliAssetsPath, `${destDir}/${constants.SOURCE_FOLDER_NAME}`);
    const tsConfigPromise = copyAssetFile('tsconfig.json', cliAssetsPath, destDir);
    const tsLintPromise = copyAssetFile('tslint.json', cliAssetsPath, destDir);
    
    return Promise.all([appPromise, tsConfigPromise, tsLintPromise]);
}

function modifyAppFiles(appPath, packageManager) {
    const indexPromise = modifyIndexJs(appPath);
    const packagePromise = modifyPackageJson(appPath, packageManager);
    const removeAppJsPromise = removeAppJs(appPath);

    return Promise.all([
        indexPromise,
        packagePromise,
        removeAppJsPromise
    ]);
}

function copyAssetFile(fileName, cliAssetsPath, destDir) {
    return copyFile(
        `${cliAssetsPath}/${fileName}`,
        `${destDir}/${fileName}`
    );
}

function modifyIndexJs(appPath) {
    return new Promise((resolve, reject) => {
        const fileName = `${appPath}/index.js`;

        fs.readFile(fileName, 'utf8', (error, content) => {
            if(error) {
                reject(error);
                return;
            }

            const replacedContent = content.replace(/'.\/App'/i, `'./${constants.BUILD_FOLDER_NAME}/App'`);

            fs.writeFile(fileName, replacedContent, 'utf8', error => {
                if(error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        })
    });
}

function modifyPackageJson(appPath, packageManager) {
    return new Promise((resolve, reject) => {
        const fileName = `${appPath}/package.json`;

        fs.readFile(fileName, 'utf8', (error, content) => {
            if(error) {
                reject(error);
                return;
            }

            const packageJson = JSON.parse(content);
            const command = packageManager + ' ' + commandArgs[packageManager].run;

            packageJson.scripts = Object.assign(
                {},
                packageJson.scripts,
                {
                    "tsc": "tsc",
                    "clean": "rimraf build",
                    "build": `${command} clean && ${command} tsc --`,
                    "lint": "tslint src/**/*.ts",
                    "watch": `${command} build -w`,
                    "ios": `${command} build && concurrently -r \"${command} watch\" \"react-native run-ios\"`,
                    "android": `${command} build && concurrently -r \"${command} watch\" \"react-native run-android\"`
                }
            );

            const replacedContent = JSON.stringify(packageJson, null, '\t');

            fs.writeFile(fileName, replacedContent, 'utf8', error => {
                if(error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        })
    });
}

function removeAppJs(appPath) {
    return new Promise((resolve, reject) => {
        fs.unlink(`${appPath}/App.js`, error => error ? reject(error) : resolve());
    });
}

function installDevDeps(appPath, packageManager) {
    return new Promise((resolve, reject) => {
        const defaults = {
            cwd: appPath,
            env: process.env
        };

        const dependencies = [
            'react-native-cli',
            'concurrently',
            'rimraf',
            'typescript',
            'tslint',
            '@types/jest',
            '@types/react',
            '@types/react-native'
        ];

        let native = spawn(
            getCommand(packageManager), 
            commandArgs[packageManager].dev(dependencies),
            defaults);

        native.stdout.on('data', message.info);
        
        native.stderr.on('data', data => {
            let text = data.toString();
            if (text.startsWith('Error')) {
                message.error(data);
            } else if (text.startsWith('warning')) {
                message.warn(data);
            }
        });
    
        native.on('error', message.error);
    
        native.on('close', code => {
            if (code !== 0) {
                reject(`Child process exited with code ${code}`);
                return;
            }
            
            resolve();
        });
    });
}

function copyFile(source, destination) {
    return new Promise((resolve, reject) => {
        let writeStream = 
            fs.createWriteStream(destination)
                .on('error', error => rejectCleanup)
                .on('finish', resolve);

        let readStream = 
            fs.createReadStream(source)
                .on('error', error => rejectCleanup)
                .pipe(writeStream);

        function rejectCleanup(error) {
            readStream.destroy();
            writeStream.end();
            reject(error);
        }
    });
}

function getCommand(command) {
    return process.platform === 'win32' ? command + '.cmd' : command;
}

main(process.argv);