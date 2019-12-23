const ajv = new (require('ajv'))();
const configSchema = require('./schema');
const path = require('path');
const packageJSON = require('../../package');
const logger = require('../logger');
const fs = require('fs');

const DeploymentBand = {
	DEVELOP: 'develop',
	RELEASE: 'release',
	PRODUCTION: 'production'
};

function loadConfig(paths, idx) {
	let configPath = paths[idx];
	configPath = path.join(configPath, packageJSON.name, 'config.json');

	try {
		let config = require(configPath);
		console.log(`Loaded config from ${configPath}`)
		return config;
	} catch(err) {
		if(idx + 1 < paths.length) {
			return loadConfig(paths, idx + 1);
		}
	}
}

function tryLoad(paths) {
	return loadConfig(paths, 0);
}

let configPaths = [
	'/opt/data',
	'/data',
	__dirname
];

var config = {};


try {
	config = tryLoad(configPaths);
} catch(err) {
	logger.warn(`config not found at path='${configPaths}', using default config`);
	throw err;
}

var valid = ajv.validate(configSchema, config);
if (!valid)  {
	throw new Error('config failed validation:' + JSON.stringify(ajv.errors));
}

if(config.deploymentDir) {
	if(!config.deploymentDir.startsWith('/')) {
		throw new Error('deploymentDir needs to be an absolute path');
	}

	try {
		fs.statSync(config.deploymentDir);
	} catch(err) {
		if(err.code === 'ENOENT') {
			throw new Error(`folder '${config.deploymentDir}' does not exist`);
		}
		throw err;
	}
}

config.isProduction = config.band === DeploymentBand.PRODUCTION;

module.exports = config;


