// Adds push-notification settings on top of app.json.
// google-services.json (Firebase) is NOT kept in the code: the APK build writes it from the GitHub secret GOOGLE_SERVICES_JSON.
// Without it the app still builds and works; only phone alerts (push) stay unavailable.
const fs = require('fs');

module.exports = ({ config }) => {
  const plugins = [...(config.plugins || []), ['expo-notifications', { icon: './assets/notification-icon.png', color: '#001952' }]];
  return {
    ...config,
    plugins,
    android: { ...config.android, ...(fs.existsSync('google-services.json')   // expo runs this from the project folder ? { googleServicesFile: './google-services.json' } : {}) },
  };
};
