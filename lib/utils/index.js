const fs = require('fs');
const semver = require('semver');
const config = require('../config');
const logger = require('../logger');

exports.pathExists = pathExists;
exports.getSemverCmp = getSemverCmp;
exports.deploymentToString = deploymentToString;
exports.emitMessage = emitMessage;

function pathExists(filePath) {
	return new Promise(function (resolve, reject) {
		fs.stat(filePath, function (err) {
			resolve(!err);
		})
	})
}

function getSemverCmp({asc, desc} = {}) {
	let isAscending = asc === true || desc !== true;

	return function (versionA, versionB) {
		versionA = semver.coerce(versionA);
		versionB = semver.coerce(versionB);


		if (versionA === versionB) {
			return 0;
		}

		if (!versionA && versionB) {
			return isAscending ? -1 : 1
		}

		if (versionA && !versionB) {
			return isAscending ? 1 : -1;
		}

		if (semver.gt(versionA, versionB)) {
			return isAscending ? 1 : -1;
		}
		if (semver.gt(versionB, versionA)) {
			return isAscending ? -1 : 1;
		}
		return 0;
	}
}

/**
 * @param {Deployment} deployment
 */
function deploymentToString(deployment) {
	let name = deployment.name || deployment['deploymentName'];
	let str = `${name}-${deployment.version}-${deployment.band}`;

	if (deployment.pullRequestMeta) {
		str += `-prid${deployment.pullRequestMeta.pullId}-${deployment.pullRequestMeta.sourceBranch}`;
	}

	return str;
}

/**
 *
 * @param {object} opt
 * @param {string} opt.message
 * @param {string=} opt.type
 * @param {string=} opt.subTitle
 */
function emitMessage({message, type, subTitle}) {
	let body = message;
	type = type || 'information';

	const {emitMessage} = require('hermes-cli/lib/deploy');

	let title = `*${config.serverTag}* (${config.hostname})`;

	return emitMessage({title, body, subTitle, type}).catch(err => {
		logger.error(`emit message failed with`, err);
	})
}