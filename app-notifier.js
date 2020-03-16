const {pm2List} = require('./lib/utils/pm2');
const timeoutInterval = 5000;
const {emitMessage} = require('./lib/utils');

const ERRORED_APPS = {};

class Notifier {
	async run() {
		let apps = await pm2List();

		apps.forEach(app => {
			let isErrored = app.pm2_env.status === 'errored';
			if (isErrored) {
				ERRORED_APPS[app.name] = true;
				emitMessage({message: `Application ${app.name} has status errored`, type: 'error'});
			} else if (ERRORED_APPS[app.name]) {
				delete ERRORED_APPS[app.name];
				emitMessage({message: `Application ${app.name} has recovered from status errored`, type: 'success'});
			}

		});
		await this.sleep();
		return this.run();
	}

	sleep() {
		return new Promise((resolve, reject) => {
			setTimeout(resolve, timeoutInterval);
		});
	}
}

module.exports = new Notifier();