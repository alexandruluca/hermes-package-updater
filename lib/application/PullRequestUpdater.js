const {Updater} = require('../updater/Updater');

class PullRequestUpdater extends Updater {
	/**
	 * @param {Object} app
	 * @param {String} app.version
	 * @param {String} app.previousVersion
	 */
	filterApplicationUpdateFn(app) {
		return true;
	}
}

exports.PullRequestUpdater = PullRequestUpdater;