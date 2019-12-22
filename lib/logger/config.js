const config = {
	"appenders": {
		"com.hermes.package-updater": {
			"type": "console",
			"layout": {
				type: "pattern",
				pattern: "%[%d %p -%] %m"
			}
		}
	},
	"categories": {
		"default": {
			"appenders": ["com.hermes.package-updater"], "level": "info"
		}
	}
};

module.exports = config;