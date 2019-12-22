const fs = require('fs');
const {promisify} = require('util');
const shell = require('shelljs');

exports.readdir = promisify(fs.readdir);

exports.rmDir = rmDir;

function rmDir(dirPath) {
	return new Promise((resolve, reject) => {
		shell.exec(`rm -rf ${dirPath}`, function (err) {
			err ? reject(err) : resolve();
		});
	});
}