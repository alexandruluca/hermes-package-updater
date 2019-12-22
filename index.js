const api = require('hermes-cli/lib/package-api');

api.initialize().then(() => {
	require('./app.js');
}).catch(err => {
	console.log('hermes-cli initialization failed with', err);
	process.exit(1);
});