const fs = require('fs');
const path = require('path');
let template = fs.readFileSync(path.join(__dirname, './readme-template.md'), 'utf8');

let tplData = {
	version: require(path.join(__dirname, '../../package')).version
};
let keys = Object.keys(tplData);

const README = template.replace(new RegExp(`{{(${keys.join('|')})}}`, 'g'), function(match, key) {
	return tplData[key];
});

fs.writeFileSync(path.join(__dirname, '../../README.md'), README);