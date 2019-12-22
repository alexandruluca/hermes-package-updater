/**
 *
 * @typedef {Object<String, any>} Deployment
 * @property {PullRequestMeta=} pullRequestMeta
 * @property {String=} version
 * @property {String=} name
 * @property {String=} band
 * @property {String=} id
 * @property {String[]?} serverTags
 * @property {String=} iosCfBundleId
 * @property {String=} androidVersionCode
 * @property {Boolean=} isMobileApplicationDeployment
 */

/**
  *
  * @typedef {Object<String, any>} PullRequestMeta
  * @property {String=} actualCommit
  * @property {String=} pullId
  * @property {String=} pullDescription
  * @property {String=} pullLink
  * @property {String=} pullTitle
  * @property {String=} sourceBranch
  * @property {String=} targetBranch
  * @property {String=} jiraTaskKey
  * @property {String=} sha1
  * @property {String=} status
  */

/**
  * @typedef {Object<String, any>} DeploymentSequence
  * @property {String} deploymentName
  * @property {String} band
  * @property {VersionSequence} sequence
 */

/**
  * @typedef {Object} VersionSequence
  * @property {String=} version
  * @property {String=} iosCfBundleId
  * @property {String=} androidVersionCode
  */