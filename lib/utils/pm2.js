const pm2 = require('pm2');
const logger = require('../logger');
const config = require('../config');
const fs = require('../utils/fs');
const path = require('path');
const {getManifest} = require('hermes-cli/utils/manifest');
const {getProjectConfiguration} = require('hermes-cli/lib/deploy');
const numCPUs = require('physical-cpu-count')
const shell = require('shelljs');

exports.pm2Reload = pm2Reload;
exports.pm2List = pm2List;

async function pm2Reload(appName, skipIfStarted) {
	skipIfStarted = skipIfStarted === true;
	let watchedApp = config.watchedApps.find(app => app.name === appName);

	if (watchedApp && !watchedApp.reload) {
		logger.info(`${appName} is a static app, skipping reload`);
		return;
	}

	if (!watchedApp.projectPath) {
		watchedApp.projectPath = path.join(config.deploymentDir, appName);
	}

	let {runtimeOptions} = getManifest(watchedApp.projectPath);

	if (!runtimeOptions) {
		logger.info(`No runtime configurations found for ${appName}, skipping reload`);
		return;
	}

	if (runtimeOptions.configurable) {
		let configServerTag = config.serverTag;
		if (config.isBackupServer) {
			configServerTag += '-backup';
		}
		logger.info(`Getting project configuration for app ${appName} and server ${configServerTag}`);
		let projectConfig = await getProjectConfiguration(configServerTag, appName);

		let configPath = path.join(config.configDir, appName, 'config.json');
		shell.mkdir('-p', path.dirname(configPath));

		fs.writeFile(configPath, JSON.stringify(projectConfig, null, '\t'));

		logger.info(`Configuration was downloaded for app ${appName} and server ${configServerTag}`);
	}

	let projectPath = path.join(config.deploymentDir, appName);

	let isStarted = await isProcessOnline(appName);

	if (config.isBackupServer) {
		let isRunning = await isProcessRunning(appName);

		if (isRunning && !isStarted) {
			return 'paused';
		}
	}

	if (skipIfStarted && isStarted) {
		return 'running';
	}

	if (!isStarted) {
		await startApp({...watchedApp, runtimeOptions, projectPath});
		return 'started';
	}

	await new Promise((resolve, reject) => {
		pm2.reload(appName, (err) => {
			if (err) {
				return reject(err);
			}
			return resolve();
		});
	});

	return 'reloaded'
}

async function startApp({name, runtimeOptions, projectPath}) {
	return new Promise((resolve, reject) => {
		let numInstances = runtimeOptions.instances === 'max' ? numCPUs : runtimeOptions.instances;
		numInstances = Math.min(numInstances, 4);

		let enableWatch = !runtimeOptions.cron; // disable watch for cron

		pm2.start({
			name: name,
			cwd: projectPath,
			script: runtimeOptions.script,
			execMode: runtimeOptions.execMode,
			cron: runtimeOptions.cron ? runtimeOptions.cron : undefined,
			restartDelay: runtimeOptions.restartDelay || 0,
			instances: runtimeOptions.execMode === 'cluster' ? numInstances : undefined,
			watch: enableWatch,
			env: {
				NODE_ENV: 'production',
				DATA_DIR: path.join(config.configDir, name)
			}

		}, (err) => {
			err ? reject(err) : resolve();
		});
	});
}

async function isProcessOnline(appName) {
	try {
		let details = await pm2Describe(appName);
		return details[0] && details[0].pm2_env.status === 'online';
	} catch (err) {
		return false;
	}
}

async function isProcessRunning(appName) {
	try {
		let details = await pm2Describe(appName);
		return details[0] && !!details[0].pm2_env.status;
	} catch (err) {
		return false;
	}
}

async function pm2Describe(appName) {
	return new Promise((resolve, reject) => {
		pm2.describe(appName, (err, res) => {
			err ? reject(err) : resolve(res);
		});
	});
}

function pm2List() {
	return new Promise((resolve, reject) => {
		// @ts-ignore
		pm2.list(true, (err, apps) => {
			if (err) {
				return reject(err);
			}

			return resolve(apps);
		});
	});
}