export const Platform = { OS: 'android', select: (o) => o.android ?? o.default };
export const Linking = { openURL: async () => {}, openSettings: async () => {} };
export const AppState = { addEventListener: () => ({ remove() {} }), currentState: 'active' };
export const Keyboard = { addListener: () => ({ remove() {} }) };
export default {};
