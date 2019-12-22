const EventEmitter = require('events').EventEmitter;

const {ApplicationFactory} = require('../application/factories/ApplicationFactory');
const {getLastDeployment} = require('hermes-cli/lib/deploy');
const semver = require('semver');
const errcode = require('err-code');
const config = require('../config');
const logger = require('../logger');
const updaterUtils = require('./utils');
const utils = require('../utils');
const {Band} = require('../../domain');
const isQaBand = config.band === Band.QA;

const ErrorCode = {
	VERSION_INSTALLED: 'version_installed',
	DEPLOYMENT_NOT_FOUND: 'deployment_not_found'
};

require('../typedef');

class Updater extends EventEmitter {
	constructor(band) {
		super();

		if (!band) {
			throw new Error('band not provided');
		}
		this.band = band;
		this.monitoredApps = {};
	}

	/**
	 *
	 * @param {Deployment} deployment
	 * @param {Object} options - should be one of isNewDeployment, isDeploymentInstall
	 * @param {Boolean=} options.isNewDeployment
	 * @param {Boolean=} options.isDeploymentInstall
	 */
	canInstallDeployment(deployment, options = {}) {
		if (Object.keys(options).length !== 1) {
			throw new Error('invalid options');
		}

		let monitoredApp = this.getMonitoredApp({deploymentName: deployment.name});
		let deploymentIdentifier = utils.deploymentToString(deployment);

		if (!monitoredApp) {
			logger.warn(`no monitored app found for ${deployment.name}`);
			return false;
		}

		if (config.band === Band.PRODUCTION) {
			if (deployment.serverTags.includes(config.serverTag)) {
				logger.info(`${deploymentIdentifier} is installable, prod server tag matches deployment server tag`);
				return true;
			}
			logger.info(`${deploymentIdentifier} is not installable, prod server tag does not match deployment server tag`);
			return false;
		}

		if(config.band !== Band.QA) {
			if(config.band === deployment.band) {
				logger.info(`${deploymentIdentifier} is installable, deployment band matches updater band`);
				return true;
			}
			logger.info(`${deploymentIdentifier} is not installable, deployment band does not match updater band`);
			return false;
		}

		// QA band

		if (deployment.band === Band.RELEASE) {
			// handle reset to release
			if (options.isDeploymentInstall) {
				logger.info(`${deploymentIdentifier} is installable, deployment is force release reset`);
				return true;
			}

			if (monitoredApp.isPullRequestDeployment() === false) {
				logger.info(`${deploymentIdentifier} is installable, current deployment is not a pull request`);
				return true;
			} else {
				logger.info(`${deploymentIdentifier} is not installable, current deployment is a pull request`);
				return false;
			}
		}

		if(deployment.band === Band.QA) {
			// handle explicit PR install
			if(options.isDeploymentInstall) {
				return true;
			}

			// handle new PR deployment creation, update only if current PR deployment is for the same JIRA task
			if (options.isNewDeployment) {
				if (monitoredApp.pullRequestMeta) {
					let jiraTaskKey = deployment.pullRequestMeta.jiraTaskKey;

					if (monitoredApp.pullRequestMeta.jiraTaskKey === deployment.pullRequestMeta.jiraTaskKey) {
						logger.info(`deployment ${deploymentIdentifier} is installable, same jiraTask deployment was identified`);
						return true;
					} else {
						logger.info(`deployment ${deploymentIdentifier} is not installable, current deployment is based of ${jiraTaskKey}`);
						return false;
					}
				} else {
					logger.info(`deployment ${deploymentIdentifier} is not installable, current deployment is release deployment`);
					return false;
				}
			}
		}

		logger.info(`deployment ${deploymentIdentifier} is not installable`);

		return false;
	}

	/**
	 *
	 * @param {Object} query
	 * @param {String} query.deploymentName
	 */
	getMonitoredApp(query) {
		return Object.values(this.monitoredApps).find(app => {
			for(let prop in query) {
				if(query[prop] !== app[prop]) {
					return false;
				}
			}
			return true;
		});
	}

	/**
	 *
	 * @param apps
	 * @param {Deployment} deployment
	 * @param {Object} options - should be one of isNewDeployment, isDeploymentInstall
	 * @param {Boolean=} options.isNewDeployment
	 * @param {Boolean=} options.isDeploymentInstall
	 * @return {Promise<any[]>}
	 */
	async update(apps, deployment, options) {
		var updates = [];

		if (deployment) {
			let isInstallable = this.canInstallDeployment(deployment, options);

			if (!isInstallable) {
				return [];
			}
		}

		for (let i = 0; i < apps.length; i++) {
			let appMeta = apps[i];
			let appName = appMeta.name;
			let app = this.monitoredApps[appName] = ApplicationFactory.getApplicationInstance(appMeta);

			if (isQaBand && !deployment && app.isPullRequestDeployment()) {
				logger.info(`[${app.name}]: skipping update check, current installed version is pull request deployment`);
				continue;
			}

			if (!deployment) {
				updates.push(this.updateApplication(app));
			} else if (app.deploymentName === deployment.name) {
				updates.push(this.updateApplication(app, deployment));
			}
		}

		return Promise.all(updates).then(updates => {
			return updates.filter(({app}) => {
				return (app.version !== app.previousVersion) || app.isPullRequestDeployment() || app.wasPullRequestDeployment();
			});
		});
	}

	/**
	 * @param {Object} appMeta
	 * @param {String} appMeta.name
	 * @param {String} appMeta.dir
	 * @param {Boolean} appMeta.reload
	 * @param {Application[]} appMeta.siblingApps
	 */
	setMonitoredApp(appMeta) {
		this.monitoredApps[appMeta.name] = ApplicationFactory.getApplicationInstance(appMeta);
	}

	getApps() {
		return this.monitoredApps;
	}

	/**
	 *
	 * @param {Application} app
	 * @param {Object=} deployment
	 */
	updateApplication(app, deployment) {
		return this._updateApplication(app, deployment).then(app => {
			return {
				success: true,
				app: app
			}
		}).catch(err => {
			return {
				success: false,
				app: app,
				err: err
			}
		})
	}

	/**
	 *
	 * @param {Application} app
	 * @param {Object} deployment
	 * @return {Promise<{updatePerformed: boolean}>}
	 * @private
	 */
	async _updateApplication(app, deployment) {
		let getDeploymentOptions = {
			serverTag: config.serverTag
		};

		let deploymentBand = (deployment && deployment.band) || this.band;

		if (!deployment) {
			if (app.isPullRequestDeployment()) {
				throw new Error(`[${app.name}]: unable to get last deployments for pull-request deployments`);
			}

			if (isQaBand) {
				deploymentBand = Band.RELEASE;
			}

			deployment = await getLastDeployment(app.deploymentName, deploymentBand, getDeploymentOptions);
		}

		const checkServerTag = config.isProduction;

		if (checkServerTag && !deployment.serverTags.includes(config.serverTag)) {
			throw new Error(`updating failed: expected server-tag='${config.serverTag}' but got '${deployment.serverTags}'`);
		}

		let isPullRequest = !!(app.isPullRequestDeployment() || deployment.pullRequestMeta);

		if (!isPullRequest && !semver.gt(deployment.version, app.version)) {
			throw errcode(new Error(`${app.name} is up to date @${app.version}`), ErrorCode.VERSION_INSTALLED);
		}

		var deploymentMeta = {
			deploymentId: deployment.id,
			deploymentName: deployment.name,
			version: deployment.version,
			band: deploymentBand,
			pullRequestMeta: deployment.pullRequestMeta
		};

		return app.update(deploymentMeta);
	}
}

exports.Updater = Updater;
exports.ErrorCode = ErrorCode;