const log4js = require('log4js');
const logger = log4js.getLogger('com.hermes.package-updater');
logger.level = 'debug';

log4js.configure(require('./config'));

module.exports = logger;

exports.getLogger = function (namespace) {
	return ['info', 'log', 'error', 'debug'].reduce((_logger, type) => {
		_logger[type] = function (message) {
			return logger.info(`[${namespace}]: ${message}`);
		}
		return _logger;
	}, {});
}