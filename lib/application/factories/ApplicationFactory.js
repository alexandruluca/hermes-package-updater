const {Application} = require('../Application');
const config = require('../../../lib/config');

class ApplicationFactory {
	/**
	 * @param {Object} options
	 * @param {String} options.name
	 * @param {String} options.dir
	 * @param {Boolean} options.reload
	 * @param {Application[]} options.siblingApps
	 */
	static getApplicationInstance(options) {
		return new Application(options);
	}
}

exports.ApplicationFactory = ApplicationFactory;