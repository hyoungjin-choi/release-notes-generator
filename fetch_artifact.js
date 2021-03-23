import axios from 'axios';
import * as fs from 'fs';
import * as core from '@actions/core';

try {
  const getEnvironmentVariable = (name) => {
    const value = process.env[name];
    if (value == null) throw new Error(`${name} is not set`);
    core.debug(`${name}: ${value}`);
    return value;
  };

  const artifact_name = 'main.js';
  core.debug(`Artifact name: ${artifact_name}`);
  const action_repository = getEnvironmentVariable('GITHUB_ACTION_REPOSITORY');
  const action_ref = getEnvironmentVariable('GITHUB_ACTION_REF');
  const action_path = getEnvironmentVariable('GITHUB_ACTION_PATH');
  const server_url = getEnvironmentVariable('GITHUB_SERVER_URL');
  const api_url = getEnvironmentVariable('GITHUB_API_URL');

  const ensureSuccessStatusCode = (response) => {
    if (response.status !== 200) {
      throw Error(
        `${response.status} ${response.statusText}: (${response.data})`
      );
    }
  };

  const getReleaseArtifact = async (releaseTag) => {
    const url = `${server_url}/${action_repository}/releases/download/${releaseTag}/${artifact_name}`;
    core.info(`Getting release artifact from ${url}`);
    return axios.get(url, { responseType: 'stream' });
  };

  const getReleaseTagFromAnnotatedTag = async (tag) => {
    const url = `${api_url}/repos/${action_repository}/git/refs/tags/${tag}`;
    console.info(`Getting release tag from ${url}`);
    const tagResponse = await axios.get(url);

    ensureSuccessStatusCode(tagResponse);

    if (tagResponse.data.object.type === 'tag') {
      const commitUrl = tagResponse.data.object.url;
      core.info(`Tag found, getting commit from ${commitUrl}`);
      const refTagResponse = await axios.get(commitUrl);

      var releaseTag = refTagResponse.data.message.trim();
      core.info(`Tag ${tag} is pointing at release ${releaseTag}`);
      return releaseTag;
    }

    throw Error(`${tag} is not an annotated tag`);
  };

  const run = async () => {
    let getReleaseArtifactResponse;
    try {
      getReleaseArtifactResponse = await getReleaseArtifact(action_ref);
    } catch (error) {
      if (error.response.status !== 404) {
        throw error;
      }

      core.info('Artifact was not found, searching for release');
      const releaseTag = await getReleaseTagFromAnnotatedTag(action_ref);
      getReleaseArtifactResponse = await getReleaseArtifact(releaseTag);
    }

    ensureSuccessStatusCode(getReleaseArtifactResponse);

    const artifactPath = `${action_path}/lib/${artifact_name}`;
    core.debug(`Writing script to ${artifactPath}`);
    const artifactWriter = fs.createWriteStream(artifactPath);
    getReleaseArtifactResponse.data.pipe(artifactWriter);
  };

  run();
} catch (error) {
  core.setFailed(`Action failed with error ${error}`);
}