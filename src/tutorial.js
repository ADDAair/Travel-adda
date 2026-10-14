import { createContext, useContext } from 'react';
// Shared tutorial state: handsOnPending = user has not yet done the "tap the Dua button" practice.
export const TutorialCtx = createContext({ handsOnPending: false, completeHandsOn: () => {}, skipHandsOn: () => {}, replay: () => {} });
export const useTutorial = () => useContext(TutorialCtx);
