const pm2 = require('pm2');
const pmx = require('pmx');
const logger = require('./lib/logger');
const config = require('./lib/config');
const {UpdaterFactory} = require('./lib/application/factories/UpdaterFactory');
const {ErrorCode: UpdaterErrorCode} = require('./lib/updater/Updater');
const updater = UpdaterFactory.getUpdaterInstance(config.band);
const _package = require('./package.json');
const {emitMessage} = require('./lib/utils');
const {ensureDeploymentLocation} = require('./lib/utils/app');
const {pm2Reload} = require('./lib/utils/pm2');
const notifier = require('./app-notifier');

notifier.run();

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
	if (err) {
		return logger.error(err);
	}
	logger.info(`${_package.name} started successfully on band='${config.isProduction ? 'production' : config.band}'`);
	if (config.serverTag) {
		logger.info(`${_package.name} listening for changes on server with tag='${config.serverTag}'`)
	}

	pmx.action('show:versions', function (reply) {
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
				if (app.dir === siblingApp.dir && app !== siblingApp) {
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
			if (success) {
				let apps = app.siblingApps.concat(app);

				return apps.reduce((promise, app) => {
					pruneOldDeployments.push(function () {
						if (!app.pruneOldDeployments) {
							return Promise.resolve();
						}
						return app.pruneOldDeployments();
					});

					promise = promise.then(async() => {
						let message = `Application ${app.name} has been updated from ${(app.previousDeployment || app).toString()} to ${app.toString()}`;

						emitMessage({message, type: 'success'});

						emitApplicationUpdateEvent(app);
						logger.info(message);
						let state = await pm2Reload(app.name);
						logger.info(`${app.name} was ${state}`);

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
					emitMessage({message: `${app.name} update failed with ${err.message}`, type: 'error'});
				}
			}
		});

		await Promise.all(reloadApps);

		pruneOldDeployments = pruneOldDeployments.map(prune => prune());

		await Promise.all(pruneOldDeployments);

	} catch (err) {
		logger.error('update failed with', err);
		emitMessage({message: `update failed with ${err.message}`, type: 'error'})
	} finally {

	}
}

async function getApps() {
	let apps = await Promise.all(config.watchedApps.map(async (app) => {
		await ensureDeploymentLocation(app.name, app.path);
		return {
			name: app.name,
			dir: app.path
		}
	}));

	logger.info(`Monitored apps:`, apps.map(app => app.name));

	return apps;
}

