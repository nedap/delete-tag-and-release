const fetch = require("./fetch");

if (!process.env.GITHUB_TOKEN) {
  console.error("🔴 no GITHUB_TOKEN found. pass `GITHUB_TOKEN` as env");
  process.exitCode = 1;
  return;
}
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

let owner, repo;

if (process.env.INPUT_REPO) {
  [owner, repo] = process.env.INPUT_REPO.split("/");
} else if (process.env.GITHUB_REPOSITORY) {
  [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
} else {
  console.error("🔴 no GITHUB_REPOSITORY found. pass `GITHUB_REPOSITORY` as env or owner/repo as inputs");
  process.exitCode = 1;
  return;
}
console.log(`📕  given repo is "${owner}/${repo}"`);

if (!process.env.INPUT_TAG_NAME) {
  console.error("🌶  no tag name found. use `tag_name` to pass value");
  process.exitCode = 1;
  return;
}
const tagPattern = process.env.INPUT_TAG_NAME;

const shouldDeleteRelease = process.env.INPUT_DELETE_RELEASE === "true";
const shouldDeleteDraftRelease = process.env.INPUT_DELETE_DRAFT_RELEASE === "true";

const commonOpts = {
  host: "api.github.com",
  port: 443,
  protocol: "https:",
  auth: `user:${GITHUB_TOKEN}`,
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "node.js",
  },
};

console.log(`🏷  given tag is "${tagPattern}"`);

async function findTags() {
  let tags = [];
  try {
    const data = await fetch({
      ...commonOpts,
      path: `/repos/${owner}/${repo}/tags`,
      method: "GET",
    });
    tags = (data || [])
      .filter(({ name }) => new RegExp(tagPattern).test(name));
  } catch (error) {
    console.error(`🌶  failed to get list of tags <- ${error.message}`);
    return [];
  }
  return tags;
}

async function deleteTag(tag) {
  const tagRef = `refs/tags/${tag}`;
  try {
    const _ = await fetch({
      ...commonOpts,
      path: `/repos/${owner}/${repo}/git/${tagRef}`,
      method: "DELETE",
    });

    console.log(`✅  tag "${tag}" deleted successfully!`);
  } catch (error) {
    console.error(`🌶  failed to delete ref "${tagRef}" <- ${error.message}`);
    if (error.message === "Reference does not exist") {
      console.error("😕  Proceeding anyway, because tag not existing is the goal");
    } else {
      console.error(`🌶  An error occured while deleting the tag "${tag}"`);
      process.exitCode = 1;
    }
    return;
  }
}

async function deleteReleases(tag_pattern) {
  let releases = [];
  try {
    const data = await fetch({
      ...commonOpts,
      path: `/repos/${owner}/${repo}/releases`,
      method: "GET",
    });
    releases = (data || [])
      .filter(({ tag_name, draft }) => new RegExp(tag_pattern).test(tag_name) && (shouldDeleteDraftRelease || (draft === false)));
  } catch (error) {
    console.error(`🌶  failed to get list of releases <- ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (releases.length === 0) {
    console.error(`😕  no releases found associated to tag "${tag_pattern}"`);
    return;
  }
  console.log(`🍻  found ${releases.length} releases to delete`);

  let hasError = false;
  for (let i = 0; i < releases.length; i++) {
    const releaseId = releases[i].id;
    const releaseTag = releases[i].tag_name;

    try {
      console.log(`ℹ️  removing release ${releaseTag}..`);
      const _ = await fetch({
        ...commonOpts,
        path: `/repos/${owner}/${repo}/releases/${releaseId}`,
        method: "DELETE",
      });
    } catch (error) {
      console.error(`🌶  failed to delete release with id "${releaseId}"  <- ${error.message}`);
      hasError = true;
      break;
    }
  }

  if (hasError) {
    process.exitCode = 1;
    return;
  }

  console.log(`👍🏼  all releases deleted successfully!`);
}

async function run() {
  const tags = await findTags();
  if (tags.length == 0) {
    deleteReleases(tagPattern);
  } else {
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i].name;
      if (shouldDeleteRelease) {
        await deleteReleases(tag);
      }
      await deleteTag(tag);
    }
  }
}

run();
