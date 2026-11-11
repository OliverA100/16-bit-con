/** One module per scene, loaded on demand: a scene's code and art arrive only when its tab is hovered, focused or opened. */
import type { SceneId } from '../../data/sessions';
import type { SceneModule } from '../kit';

export const sceneModules: Record<SceneId, () => Promise<SceneModule>> = {
  field: () => import('./field').then((m) => m.default),
  city: () => import('./city').then((m) => m.default),
  party: () => import('./party').then((m) => m.default),
  office: () => import('./office').then((m) => m.default),
  desert: () => import('./desert').then((m) => m.default),
  rain: () => import('./rain').then((m) => m.default),
  beanstalk: () => import('./beanstalk').then((m) => m.default),
  park: () => import('./park').then((m) => m.default),
  sunset: () => import('./sunset').then((m) => m.default),
};
