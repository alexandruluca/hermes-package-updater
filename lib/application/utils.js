const path = require('path');
const {getSemverCmp} = require('../utils');
const fs = require('../utils/fs');
const logger = require('../../lib/logger');
const {Band} = require('../../domain');
const config = require('../../lib/config');
const isQaBand = config.band === Band.QA
const NUM_VERSIONS_TO_KEEP = 3;

exports.pruneDeployments = pruneDeployments;

/**
 *
 * @param {Object} options
 * @param {String} options.appWorkspace - root folder where the deployment is located
 * @param {String} options.deploymentName - the deployment name
 * @param {String} options.deploymentFolderName - folder where deployment is saved
 */
async function pruneDeployments({appWorkspace, deploymentName, deploymentFolderName}) {
	let dirPaths = (await fs.readdir(appWorkspace)).filter((dirPath) => {
		return filterDeletableDeployments(deploymentName, dirPath);
	});

	if (isQaBand) {
		dirPaths = dirPaths.filter(dirPath => !dirPath.endsWith(deploymentFolderName))
	} else {
		dirPaths.sort(getSemverCmp({desc: true}));
		dirPaths.splice(0, NUM_VERSIONS_TO_KEEP);
	}

	logger.info(`pruning old versions for ${deploymentName} from ${appWorkspace}`);

	let deleteFolders = dirPaths.map(dirPath => {
		let versionPath = path.join(appWorkspace, dirPath);
		logger.info(`deleting ${versionPath}`);

		return fs.rmDir(versionPath);
	});

	await Promise.all(deleteFolders);

	logger.info(`pruning finished for ${deploymentName}`);
}

function isMatching(deploymentName, dirPath, band) {
	if(arguments.length !== 3) {
		throw new Error(`missing arguments, got ${arguments.length} but expected 3`);
	}
	let jiraRegex = band === Band.QA ? '(-[A-Z]+(-?[a-zA-Z0-9]{1,10}))?' : '';
	let deploymentRegex = new RegExp(`^${deploymentName}-([0-9]+.?){3}-${band}${jiraRegex}$`);

	return deploymentRegex.test(dirPath);
}

function filterDeletableDeployments(deploymentName, dirPath) {
	let matching = isMatching(deploymentName, dirPath, config.band);

	if (isQaBand) {
		matching = matching || isMatching(deploymentName, dirPath, Band.RELEASE);
	} else if (config.isProduction) {
		matching = matching || isMatching(deploymentName, dirPath, Band.RELEASE);
	}

	return matching;
}