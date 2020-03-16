const ajv = new (require('ajv'))();
const configSchema = require('./schema');
const path = require('path');
const packageJSON = require('../../package');
const logger = require('../logger');
const fs = require('fs');
const os = require('os');

const DeploymentBand = {
	DEVELOP: 'develop',
	RELEASE: 'release',
	PRODUCTION: 'production'
};

function loadConfig(paths, idx) {
	let configPath = paths[idx];

	try {
		let config = require(configPath);
		console.log(`Loaded config from ${configPath}`)
		return {
			config,
			configPath
		};
	} catch(err) {
		if(idx + 1 < paths.length) {
			return loadConfig(paths, idx + 1);
		}
		throw err;
	}
}

function tryLoad(paths) {
	return loadConfig(paths, 0);
}

let configPaths = [
	path.join('/opt/data', packageJSON.name, 'config.json'),
	path.join('/data', packageJSON.name, 'config.json'),
	path.join(process.cwd(), 'data', packageJSON.name, 'config.json')
];

let {config, configPath} = tryLoad(configPaths);

var valid = ajv.validate(configSchema, config);
if (!valid)  {
	throw new Error('config failed validation:' + JSON.stringify(ajv.errors));
}


if (!config.deploymentDir.startsWith('/')) {
	throw new Error('deploymentDir needs to be an absolute path');
}

try {
	fs.statSync(config.deploymentDir);
} catch (err) {
	if (err.code === 'ENOENT') {
		throw new Error(`folder '${config.deploymentDir}' does not exist`);
	}
	throw err;
}

config.watchedApps.forEach(app => {
	if (!app.path.startsWith(config.deploymentDir)) {
		app.path = path.join(config.deploymentDir, app.path);
	}
});

config.isProduction = config.band === DeploymentBand.PRODUCTION;
config.hostname = os.hostname();
config.configDir = path.dirname(path.dirname(configPath));

module.exports = config;


