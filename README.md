# hermes-package-updater

## Instalation

```
pm2 install git+ssh://git@github.com:hermesMobile/hermes-package-updater.git#2.0.8
```

## Intro

A server can be configured to have automatic updates for any application. Applications (processes) which are pm2 driven, are a candidate for automatic update by default
as pm2 store all needed information about the started process. If an application which is not started with pm2 needs to be updated, some meta-information needs to be added
in the global configuration about that individual application (more explicit information below)

## Global server configuration

A server needs to be configured to run updates for a specific band only, allowed bands are either "develop" or "release"
The global configuration resides under "/data/launchbase/modules/hermes-package-updater/config.json" and should contain "band", which is the update band indicator and
"watchedApps", an array of explicitly watched applications which are not pm2 driven

### "band" param
The band param is a required config param which is the update band indicator

### "watchedApps", an array of explicitly watched applications which are not pm2 driven

### "deploymentDir"
deploymentDir will indicate the directory (must be absolute path and already created with write access) in which deployments will be downloaded. If not given,
it will default to the parent directory of the targeted application. For instance if launchbase is installed at "/app/launchbase", all new deployments will be downloaded
in "/app"

```
{
  "band": "develop",//either "release" or "develop"
  "watchedApps": [
    {
      "name": "launchbase-www",
      "path": "/app/launchbase-www",
      "reload": false
    }
  ]
}

```

## Prerequisites/Configuration of an application for automatic update

### hermes-manifest.json

Each project needs to have a hermes-manifest.json file located in the root of the project. The bare minimum hermes manifest configuration is following
"include" is used to include a subset of files/directories out of the excluded folders matched in "exclude"

For example, we can exclude "server/service/launchbase-api-client" but include only "server/service/launchbase-api-client/dist". The example below is used by launchbase
http://github.com/hermesMobile/launchbase

```
{
	"packageLocation": "",
	"include": [
		"server/service/build",
		"server/service/swagger-ui/dist",
		"server/service/launchbase-api-client/dist"
	],
	"exclude": [
		".git",
		"userdocs",
		"server/service/launchbase-api-client",
		"server/service/src",
		"server/service/swagger-ui",
		"server/www/node_modules",
		"certs",
		"aws",
		"modules",
		"changes",
		"configuration",
		"license",
		"scripts",
		"vagrant"
	],
	"includeHiddenFilesAndFolders": false
}
```


## Updating an application which is not pm2 driven

Any application can be configured for automatic updated, even if not driven by pm2. In order to do this, one needs to setup meta-information about the application in the
global configuration under "watchedApps" and requires "name", which is the deployment name of the application and can be found in package.json of the application, path, which
is the path where the application was initially cloned or installed and "reload", which should be set to "false", as the application is not pm2 drive and can't be reloaded

A full configuration sample which updates apps on the "develop" band and has "launchbase-www" configured as a watched application would look like this

```
{
  "band": "develop",//either "release" or "develop"
  "watchedApps": [
    {
      "name": "launchbase-www",
      "path": "/app/launchbase-www",
      "reload": false
    }
  ]
}

```

## Actions

### Show app versions

```
pm2 trigger hermes-package-updater show:versions
```
