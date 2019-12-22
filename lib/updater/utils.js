exports.isPullRequestDeployment = isPullRequestDeployment;

function isPullRequestDeployment(deployment) {
	return !!deployment.pullRequestMeta;
}