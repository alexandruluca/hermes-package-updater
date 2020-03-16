const {isExistingProject} = require('hermes-cli/lib/deploy');
const shell = require('shelljs');
const fs = require('fs');
const {pathExists} = require('../utils');
const path = require('path');
const logger = require('../logger');

exports.ensureDeploymentLocation = ensureDeploymentLocation;

async function ensureDeploymentLocation(projectName, appDir) {
	let validProject = await isExistingProject(projectName);

	if (!validProject) {
		throw new Error(`${projectName} is not a valid project`);
	}

	shell.mkdir('-p', appDir);

	let packageJsonLocation = path.join(appDir, 'package.json');
	let manifestLocation = path.join(appDir, 'hermes.json');

	let packExists = await pathExists(packageJsonLocation);
	let manifestExists = await pathExists(manifestLocation);

	if (!packExists) {
		logger.info(`creating default package.json for project ${projectName}`);
		let pack = {
			name: projectName,
			version: '0.0.0'
		};
		fs.writeFileSync(packageJsonLocation, JSON.stringify(pack, null, '\t'));
	}

	if (!manifestExists) {
		logger.info(`creating default manifest.json for project ${projectName}`);

		let manifest = {
			"packageLocation": "",
			"include": [
				"build/**",
				"node_modules/**"
			],
			"exclude": [],
			"includeHiddenFilesAndFolders": false
		};

		fs.writeFileSync(manifestLocation, JSON.stringify(manifest, null, '\t'));
	}

}