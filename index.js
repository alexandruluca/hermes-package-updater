const api = require('hermes-cli/lib/package-api');

initialize();

function initialize() {
	return api.initialize().then(() => {
		require('./app.js');
	}).catch(async (err) => {
		console.log('hermes-cli initialization failed with', err);
		console.log('will retry in 1 minute');

		await sleep(60000);
		return initialize();
	});
}

function sleep(millis) {
	return new Promise((resolve, reject) => {
		setTimeout(resolve, millis);
	});
}