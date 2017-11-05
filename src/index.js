#!/usr/bin/env node

import * as chalk from 'chalk';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import rimraf from 'rimraf';

import message from './message';

const SOURCE_FOLDER_NAME = 'src';
const BUILD_FOLDER_NAME = 'build';

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
        await createApp(appName, installPath)
        await createSourceDirectory(`${appPath}/${SOURCE_FOLDER_NAME}`);
        await copyAssetFiles(`${cliPath}/assets`, appPath);
        await modifyAppFiles(appPath);
        await installDeps(appPath);

        message.success(`${appName} project created successfully.`);
        message.info("Use 'yarn android' or 'yarn ios' to run.");
    }
}

function createApp(appName, installpath) {
    return new Promise((resolve, reject) => {
        const defaults = {
            cwd: installpath,
            env: process.env
        };

        let native = spawn(getCommand('react-native'), ['init', appName], defaults);
        
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
    const appPromise = copyAssetFile('App.tsx', cliAssetsPath, `${destDir}/${SOURCE_FOLDER_NAME}`);
    const tsConfigPromise = copyAssetFile('tsconfig.json', cliAssetsPath, destDir);
    const tsLintPromise = copyAssetFile('tslint.json', cliAssetsPath, destDir);
    
    return Promise.all([appPromise, tsConfigPromise, tsLintPromise]);
}

function modifyAppFiles(appPath) {
    const indexPromise = modifyIndexJs(appPath);
    const packagePromise = modifyPackageJson(appPath);
    const removeAppJsPromise = removeAppJs(appPath);

    return Promise.all([indexPromise, packagePromise, removeAppJsPromise]);
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

            const replacedContent = content.replace(/'.\/App'/i, `'./${BUILD_FOLDER_NAME}/App'`);

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

function modifyPackageJson(appPath) {
    return new Promise((resolve, reject) => {
        const fileName = `${appPath}/package.json`;

        fs.readFile(fileName, 'utf8', (error, content) => {
            if(error) {
                reject(error);
                return;
            }

            const packageJson = JSON.parse(content);
            packageJson.scripts = Object.assign(
                {},
                packageJson.scripts,
                {
                    "tsc": "tsc",
                    "clean": "rimraf build",
                    "build": "yarn clean && yarn tsc --",
                    "lint": "tslint src/**/*.ts",
                    "watch": "yarn build -- -w",
                    "ios": "yarn build && concurrently -r \"yarn watch\" \"react-native run-ios\"",
                    "android": "yarn build && concurrently -r \"yarn watch\" \"react-native run-android\""
                }
            );

            packageJson.devDependencies = Object.assign(
                {},
                packageJson.devDependencies,
                {
                    "@types/jest": "^21.1.5",
                    "@types/react": "^16.0.19",
                    "@types/react-native": "^0.49.5",
                    "concurrently": "^3.5.0",
                    "react-native-cli": "^2.0.1",
                    "rimraf": "^2.6.2",
                    "tslint": "^5.8.0",
                    "typescript": "^2.6.1"
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

function installDeps(appPath) {
    return new Promise((resolve, reject) => {
        const defaults = {
            cwd: appPath,
            env: process.env
        };

        let native = spawn(getCommand('yarn'), ['install'], defaults);
        
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