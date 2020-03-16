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

async function pm2Reload(appName) {
	let watchedApp = config.watchedApps.find(app => app.name === appName);

	if (watchedApp && !watchedApp.reload) {
		logger.info(`${appName} is a static app, skipping reload`);
		return;
	}

	let {runtimeOptions} = getManifest(watchedApp.projectPath);

	if (!runtimeOptions) {
		return;
	}

	if (runtimeOptions.configurable) {
		let projectConfig = await getProjectConfiguration(config.serverTag, appName);

		let configPath = path.join(config.configDir, appName, 'config.json');
		shell.mkdir('-p', path.dirname(configPath));

		fs.writeFile(configPath, JSON.stringify(projectConfig, null, '\t'));
	}

	let projectPath = path.join(config.deploymentDir, appName);

	let isStarted = await isProcessStarted(appName);

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
		pm2.start({
			name: name,
			cwd: projectPath,
			script: runtimeOptions.script,
			execMode: runtimeOptions.execMode,
			instances: runtimeOptions.instances === 'max' ? numCPUs : runtimeOptions.instances,
			watch: true,
			env: {
				NODE_ENV: 'production',
				DATA_DIR: path.join(config.configDir, name)
			}

		}, (err) => {
			err ? reject(err) : resolve();
		});
	});
}

async function isProcessStarted(appName) {
	try {
		let details = await pm2Describe(appName);
		return details && details.length;
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