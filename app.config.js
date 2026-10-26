// The app version lives only in package.json, so `npm version minor` bumps it and creates
// the matching release tag in one step. Android's versionCode is counted up by EAS on every build.
module.exports = ({ config }) => ({ ...config, version: require('./package.json').version });
