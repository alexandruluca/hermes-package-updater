const {Updater} = require('../../updater/Updater');
const {PullRequestUpdater} = require('../PullRequestUpdater');
const config = require('../../../lib/config');

class UpdaterFactory {
	static getUpdaterInstance(band) {
		if(config.usePullRequestDeployments) {
			return new PullRequestUpdater(band);
		}

		return new Updater(band);
	}
}

exports.UpdaterFactory = UpdaterFactory;