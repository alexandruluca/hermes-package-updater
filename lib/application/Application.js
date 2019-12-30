const {getDeploymentDetails} = require('hermes-cli/utils/manifest');
const {downloadDeployment: downloadDeploymentFn} = require('hermes-cli/lib/deploy');
const {normalizeVersion} = require('hermes-cli/utils');
const path = require('path');
const shell = require('shelljs');
const logger = require('../../lib/logger');
const fs = require('fs');
const config = require('../../lib/config');
const utils = require('../utils');
const {pruneDeployments} = require('./utils');

const State = {
	PENDING_UPDATE: 'pending_update',
	UPDATED: 'updated'
};

const ErrorCode = {
	VERSION_INSTALLED: 'version_installed'
};

class Application {
	/**
	 *
	 * @param {String} name
	 * @param {String} dir
	 * @param {Boolean} reload
	 * @param {Application[]} siblingApps
	 * @param {Boolean=} isClone - if true, initialization will be ignored as it is only being used to store values
	 */
	constructor({name, dir, reload, siblingApps, isClone}) {
		if (isClone) {
			return;
		}
		if (!name) {
			throw new Error('missing name');
		}
		if (!dir) {
			throw new Error('missing app dir');
		}

		this.dir = dir;
		this.name = name;
		this.reload = reload !== false;
		this.siblingApps = siblingApps || [];
		this.initialize();

		this.pruningMeta = {
			appWorkspace: null,
			deploymentFolderName: null
		};
	}

	/**
	 * naive way to clone an Application object. Copies over only needed properties for the toString() implementation
	 * @param {*} appObj
	 */
	static clone(appObj) {
		const Ctor = appObj.constructor;

		let obj = new Ctor({isClone: true});

		obj.version = appObj.version;

		if (appObj.pullRequestMeta) {
			obj.pullRequestMeta = JSON.parse(JSON.stringify(appObj.pullRequestMeta));
		}

		return obj;
	}

	toString() {
		let str = `${this.version}-${config.band}`;

		if (this.pullRequestMeta) {
			str += `-prid${this.pullRequestMeta.pullId}-${this.pullRequestMeta.sourceBranch}`;
		}

		return str;
	}

	initialize() {
		var {version, name: deploymentName, pullRequestMeta} = getDeploymentDetails(this.dir);

		this.previousDeployment = Application.clone(this);

		this.deploymentName = deploymentName;
		this.oldPullRequestMeta = this.pullRequestMeta;
		this.pullRequestMeta = pullRequestMeta;
		this.previousVersion = this.version;
		this.version = version;
		this.installDir = path.dirname(this.dir);

		this.siblingApps.forEach(siblingApp => {
			siblingApp.deploymentName = this.deploymentName;
			siblingApp.previousVersion = this.previousVersion;
			siblingApp.version = this.version;
		});
	}

	/**
	 * @returns {Boolean}
	 */
	isPullRequestDeployment() {
		return !!this.pullRequestMeta;
	}

	wasPullRequestDeployment() {
		return !!this.oldPullRequestMeta;
	}

	/**
	 *
	 * @param {Object} availableDeployment
	 * @param {String} availableDeployment.id
	 * @param {String} availableDeployment.deploymentName
	 * @param {String} availableDeployment.version
	 * @param {String} availableDeployment.band
	 */
	update(availableDeployment) {
		this.setUpdateAvailable(true, availableDeployment);

		return this.doUpdate();
	}


	/**
	 *
	 * @param {Object} deployment
	 * @param {String} deployment.deploymentName
	 * @param {String} deployment.band
	 * @param {String} deployment.version
	 * @param {String?} deployment.deploymentId
	 */
	downloadDeployment(deployment, opt) {
		return downloadDeploymentFn(deployment, opt);
	}

	doUpdate() {
		if(!this.isUpdateAvailable()) {
			return;
		}

		let {pullRequestMeta, ...deployment} = this.getAvailableDeployment();
		let isIncomingPullRequest = !!pullRequestMeta;

		this.setUpdateAvailable(false);

		let message = `preparing to install ${utils.deploymentToString(deployment)}`;
		logger.info(message);

		utils.emitMessage(message);

		const progressFunc = state => {
			var percent = parseInt(state.percent * 100);
			logger.info(`download in progress ${deployment.deploymentName}@${this.version} -> ${deployment.deploymentName}@${deployment.version} ${percent}%`);
		};

		logger.info('155');

		var opt = {
			cwd: config.deploymentDir || this.getInstallDir(),
			progress: {
				func: progressFunc,
				opt: {
					throttle: 5000
				}
			},
			unlinkIfExists: this.isPullRequestDeployment() || isIncomingPullRequest
		};
		logger.info('get app dir');
		var appDir = this.getAppDir();
		logger.info('get app dir done');

		logger.info('download deployment');
		return this.downloadDeployment(deployment, opt).then(async({deploymentName, installationPath}) => {
			let appWorkspace = config.deploymentDir || path.dirname(installationPath);

			logger.info(`download for ${deploymentName} finished`);

			try {
				let stat = fs.lstatSync(appDir);

				if(!stat.isSymbolicLink()) {
					//link the current app workspace in case it's not a symlink
					let appDeploymentDir = deploymentName + '-' + normalizeVersion(this.version, config.band);
					appDeploymentDir = path.join(appWorkspace, appDeploymentDir);

					shell.mv(appDir, appDeploymentDir);
					shell.ln('-s', appDeploymentDir, appDir);
				}

				shell.exec(`unlink ${appDir}`);
				shell.ln('-s', installationPath, appDir);

				this.initialize();

				let deploymentFolderName = path.basename(installationPath);

				this.pruningMeta.appWorkspace = appWorkspace;
				this.pruningMeta.deploymentFolderName = deploymentFolderName;

				logger.info(`${this.name} has been updated to version ${this.version}`);
			} catch(err) {
				console.log(err);
				throw err;
			}

			if(this.isUpdateAvailable()) {
				return this.doUpdate();
			}

			return this;
		});

	}

	async pruneOldDeployments() {
		let {appWorkspace, deploymentFolderName} = this.pruningMeta;

		if (!appWorkspace || !deploymentFolderName) {
			return logger.info(`skip pruning for ${this.deploymentName}`);
		}

		await pruneDeployments({
			appWorkspace,
			deploymentFolderName,
			deploymentName: this.deploymentName
		});

		for (let prop in this.pruningMeta) {
			this.pruningMeta[prop] = null;
		}
	}

	getAppDir() {
		return this.dir;
	}

	getInstallDir() {
		return this.installDir;
	}

	setUpdateAvailable(updateAvailable, availableDeployment) {
		this.updateAvailable = updateAvailable;
		this.availableDeployment = availableDeployment;
	}

	getAvailableDeployment() {
		return this.availableDeployment;
	}

	isUpdateAvailable() {
		return this.updateAvailable;
	}
}

exports.Application = Application;
exports.State = State;
exports.ErrorCode = ErrorCode;