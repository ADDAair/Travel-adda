// Types for OfferCard.js: how a package is shown (full page, short list card, journey and leader box).
import type { JSX, ReactNode } from 'react';
type Offer = Record<string, any>;   // an offers row
export function RouteTimeline(p: { o: Offer }): JSX.Element | null;
export function LeaderBox(p: { o: Offer; onProfile?: () => void; onMore?: () => void }): JSX.Element | null;
export function OfferSummary(p: { o: Offer; onOpen?: () => void; note?: string | null; noteColor?: string }): JSX.Element;
export function OfferCard(p: { o: Offer; children?: ReactNode; onProfile?: () => void; onMore?: () => void }): JSX.Element;
