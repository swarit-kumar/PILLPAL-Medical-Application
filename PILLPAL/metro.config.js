const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('csv'); // Allow .csv files to be imported as assets

module.exports = config;
