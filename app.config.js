// Adds push-notification settings on top of app.json.
// google-services.json (Firebase) is NOT kept in the code: the APK build writes it from the GitHub secret GOOGLE_SERVICES_JSON.
// Without it the app still builds and works; only phone alerts (push) stay unavailable.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const fcm = path.join(__dirname, 'google-services.json');
  const plugins = [...(config.plugins || []), ['expo-notifications', { icon: './assets/notification-icon.png', color: '#001952' }]];
  return {
    ...config,
    plugins,
    android: { ...config.android, ...(fs.existsSync(fcm) ? { googleServicesFile: './google-services.json' } : {}) },
  };
};
