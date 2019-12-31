const path = require('path');
const pm2 = require('pm2');
const pmx = require('pmx');
const {pathExists} = require('./lib/utils');
const logger = require('./lib/logger');
const config = require('./lib/config');
const {UpdaterFactory} = require('./lib/application/factories/UpdaterFactory');
const {ErrorCode: UpdaterErrorCode} = require('./lib/updater/Updater');
const updater = UpdaterFactory.getUpdaterInstance(config.band);
const _package = require('./package.json');
const {emitMessage} = require('./lib/utils');

const deploymentClient = require('hermes-cli/lib/deploy').client({
	serverTag: config.serverTag,
	band: config.band,
	isProduction: config.isProduction
});

function emitBootstrapSuccess() {
	const monitoredApps = updater.getApps();
	const eventMeta = Object.keys(monitoredApps).map(((appName) => {
		const app = monitoredApps[appName];

		return getEmitAppMeta(app);
	}), {});

	deploymentClient.emit('application-bootstrap', eventMeta);
}

function emitApplicationUpdateEvent(app) {
	deploymentClient.emit('application-updated', getEmitAppMeta(app));
}

function getEmitAppMeta(app) {
	return ['version', 'deploymentName', 'pullRequestMeta'].reduce((mappedApp, property) => {
		if (app.hasOwnProperty(property)) {
			mappedApp[property] = app[property];
		}
		return mappedApp;
	}, {});
}

pmx.initModule({}, function (err, conf) {
	if(err) {
		return logger.error(err);
	}
	logger.info(`${_package.name} started successfully on band='${config.isProduction ? 'production' : config.band}'`);
	if(config.serverTag) {
		logger.info(`${_package.name} listening for changes on server with tag='${config.serverTag}'`)
	}

	pmx.action('show:versions', function(reply) {
		var apps = updater.getApps();
		apps = Object.keys(apps).map(name => `${name} [${apps[name].deploymentName}] version@${apps[name].version}`);
		reply(apps);
	});

	deploymentClient.on('connect', () => {
		return doUpdate().then(() => {
			emitBootstrapSuccess();
		})
	});

	deploymentClient.on('new-deployment', (deployment) => {
		installDeployment(deployment, {isNewDeployment: true});
	});

	deploymentClient.on('install-deployment', (deployment) => {
		installDeployment(deployment, {isDeploymentInstall: true})
	});

	/**
	 *
	 * @param {Object} deployment
	 * @param {Object} options - should be one of isNewDeployment, isDeploymentInstall
	 * @param {Boolean=} options.isNewDeployment
	 * @param {Boolean=} options.isDeploymentInstall
	 */
	async function installDeployment(deployment, options) {
		return doUpdate(deployment, options);
	}
});

/**
 *
 * @param {Object} deployment
 * @param {Object} options - should be one of isNewDeployment, isDeploymentInstall
 * @param {Boolean=} options.isNewDeployment
 * @param {Boolean=} options.isDeploymentInstall
 */
async function doUpdate(deployment, options) {
	const apps = await getApps();

	try {
		apps.forEach(app => {
			apps.forEach((siblingApp, idx) => {
				if(app.dir === siblingApp.dir && app !== siblingApp) {
					app.siblingApps = app.siblingApps || [];
					app.siblingApps.push(siblingApp);
					apps.splice(idx, 1);
				}
			});
		});

		apps.forEach(app => updater.setMonitoredApp(app));

		const appUpdates = await updater.update(apps, deployment, options);

		let pruneOldDeployments = [];

		var reloadApps = appUpdates.map(({app, success, err}) => {
			if(success) {
				let apps = app.siblingApps.concat(app);

				return apps.reduce((promise, app) => {
					pruneOldDeployments.push(function () {
						if(!app.pruneOldDeployments) {
							return Promise.resolve();
						}
						return app.pruneOldDeployments();
					});

					promise = promise.then(() => {
						let message = `${app.name} has been updated from ${(app.previousDeployment || app).toString()} to ${app.toString()}`;

						emitMessage(message);

						emitApplicationUpdateEvent(app);
						logger.info(message);
						return pm2Reload(app.name);
					});
					return promise;
				}, Promise.resolve());
			} else {
				if (err.code === UpdaterErrorCode.VERSION_INSTALLED) {
					logger.info(`[${app.name}] version update skipped, app is up to date @${app.version}`);
				} else if (err.code === UpdaterErrorCode.DEPLOYMENT_NOT_FOUND) {
					logger.info(`[${app.name}] version update skipped due to no existing deployments`);
				} else {
					logger.error(`${app.name} update failed with`, err);
					emitMessage(`${app.name} update failed with ${err.message}`);
				}
			}
		});

		await Promise.all(reloadApps);

		pruneOldDeployments = pruneOldDeployments.map(prune => prune());

		await Promise.all(pruneOldDeployments);

	} catch (err) {
		logger.error('update failed with', err);
		emitMessage(`update failed with ${err.message}`)
	} finally {

	}
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

async function pm2Reload(appName) {
	let isWatchedApp = !!config.watchedApps.find(app => app.name === appName);

	if(isWatchedApp) {
		logger.info(`${appName} is a static app, skipping reload`);
		return;
	}

	return new Promise((resolve, reject) => {
		pm2.reload(appName, (err) => {
			if(err) {
				return reject(err);
			}
			logger.info(`${appName} was reloaded`);
			return resolve();
		});
	});
}

async function getApps() {
	var apps = await pm2List();

	apps = apps.filter(app => !app.pm2_env.axm_options.isModule && app.pm2_env.exec_interpreter === 'node');

	//apps = apps.concat(config.watchedApps);

	var watchedApps = await Promise.all(config.watchedApps.map(app => {
		return getProjectRoot(app.path, false).then(projectPath => {
			return {
				name: app.name,
				dir: projectPath
			}
		});
	}));

	var getApps = apps.map(item => {
		let pm2ExecPath = path.dirname(item.pm2_env.pm_exec_path);
		return getProjectRoot(item.path || pm2ExecPath || item.pm2_env.pm_cwd || item.pm2_env.PWD).then(projectPath => {
			return {
				name: item.name,
				dir: projectPath
			}
		}).catch(err => {
			return null;
		});
	});

	return Promise.all(getApps).then(apps => {
		apps = apps.filter(app => !!app);

		return apps.concat(watchedApps);
	}).then(apps => {
		logger.info(`Monitored apps:`, apps.map(app => app.name));
		return apps;
	});
}

function getProjectRoot(dirPath, checkRecursive) {
	checkRecursive = checkRecursive !== false;

	return pathExists(path.join(dirPath, 'hermes.json')).then(exists => {
		if (exists) {
			return dirPath;
		}

		if (!checkRecursive) {
			throw new Error(`hermes.json does not exist at path=${dirPath}`);
		}

		var dirname = path.dirname(dirPath);
		if (!dirname || dirname === '.' || dirname === '/') {
			throw new Error('project root not found');
		}

		return getProjectRoot(dirname);
	});
}