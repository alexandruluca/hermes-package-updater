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

var config = {};
var configPath = path.join('/data/hermes/modules', packageJSON.name, 'config.json');

if(process.env.NODE_ENV === 'development') {
	configPath = path.join(__dirname, '../../config.json');
}

try {
	config = require(configPath);
} catch(err) {
	logger.warn(`config not found at path='${configPath}', using default config`);
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


